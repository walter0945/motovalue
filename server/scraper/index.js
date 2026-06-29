/**
 * 抓取调度核心 —— 汇总所有品牌适配器, 执行一轮抓取并回写数据库。
 *
 * 设计原则:
 *   - 抓取成功 -> updatePrice 刷新, 标记 priceVerified
 *   - 抓取失败 -> 保留库存(种子)价, 记录日志
 *   - 任一品牌异常不影响其它品牌
 *   - discover=true 时先全量发现新车型, 再增量刷新价格
 */
import { getModels, updatePrice, upsertModels } from '../db.js';
import { discoverFromMotoFan } from './discover.js';
import * as moto58 from './adapters/moto58.js';
import * as haojue from './adapters/haojue.js';
import * as cfmoto from './adapters/cfmoto.js';
import * as qjmotor from './adapters/qjmotor.js';
import * as voge from './adapters/voge.js';
import * as yamaha from './adapters/yamaha.js';
import * as honda from './adapters/honda.js';

// 主源: 摩托范聚合站, 覆盖全品牌, 先执行并作为权威价。
const PRIMARY = [moto58];
// 兜底源: 各 OEM 官网, 仅补主源未命中的车型。新增品牌在此加入。
const FALLBACK = [haojue, cfmoto, qjmotor, voge, yamaha, honda];

/**
 * 执行一轮全量抓取(可含发现新车型)。
 * @param {{ log?: typeof console, discover?: boolean }} opts
 *   - discover: true 时先连摩托范发现新车型并写入数据库, 再执行增量刷新
 * @returns 统计结果
 */
export async function runScrape({ log = console, discover = false, maxBrands = 0, skipIncremental = false } = {}) {
  const startedAt = new Date();
  let models = await getModels();
  const stats = {
    discovered: 0,
    updated: 0,
    unchanged: 0,
    missed: 0,
    total: models.length,
    sources: [],
    durationMs: 0,
  };

  // ── 可选: 全量发现新车型 ──
  if (discover) {
    log.info?.('[抓取] 启动摩托范全量发现...');
    let puppeteer;
    try {
      puppeteer = (await import('puppeteer-core')).default;
    } catch {
      log.warn?.('[抓取] puppeteer-core 未安装, 跳过发现');
    }

    if (puppeteer) {
      const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
      let browser;
      try {
        browser = await puppeteer.launch({
          executablePath: CHROME,
          headless: 'new',
          args: ['--no-sandbox'],
        });
      } catch (err) {
        log.warn?.(`[抓取] 无法启动浏览器, 跳过发现: ${err.message}`);
      }

      if (browser) {
        try {
          const { models: discovered, stats: dStats } = await discoverFromMotoFan(browser, { log, maxBrands });
          if (discovered.length > 0) {
            const { added, updated } = await upsertModels(discovered);
            stats.discovered = added;
            // 发现过程中的价格更新也算
            stats.updated += updated;
            log.info?.(`[抓取] 发现完成: ${dStats.total}款车型, 新增${added}款, 价格更新${updated}款`);
          }
          // 重新加载数据库(含新增车型)
          models = await getModels();
          stats.total = models.length;
        } catch (err) {
          log.error?.(`[抓取] 全量发现失败: ${err.message}`);
        } finally {
          await browser.close();
        }
      }
    }
  }

  // ── 增量价格刷新(可跳过) ──
  if (!skipIncremental) {
    const done = new Set(); // 本轮已成功定价的车型 id

    const runAdapter = async (adapter, candidates) => {
      const stat = { source: adapter.brand, attempted: candidates.length, hits: 0 };
      try {
        for (const p of await adapter.fetchPrices(candidates, { log })) {
          if (done.has(p.id)) continue;
          const changed = await updatePrice(p.id, p.price, p.source);
          changed ? stats.updated++ : stats.unchanged++;
          done.add(p.id);
          stat.hits++;
        }
      } catch (err) {
        log.error?.(`[抓取] 源「${adapter.brand}」失败, 保留库存价: ${err.message}`);
      }
      stats.sources.push(stat);
    };

    // 主源处理全部车型
    for (const a of PRIMARY) await runAdapter(a, models);
    // 兜底源只处理主源未命中且品牌匹配的车型
    for (const a of FALLBACK) {
      await runAdapter(a, models.filter((m) => !done.has(m.id) && m.brand === a.brand));
    }

    stats.missed = models.length - done.size;
  } else {
    log.info?.('[抓取] 跳过增量刷新(discover 模式已获取价格)');
    stats.missed = models.length;
  }
  stats.durationMs = Date.now() - startedAt.getTime();
  log.info?.(`[抓取] 完成: 发现 ${stats.discovered}, 更新 ${stats.updated}, 未变 ${stats.unchanged}, 未命中 ${stats.missed}/${stats.total}, 用时 ${stats.durationMs}ms`);
  return stats;
}
