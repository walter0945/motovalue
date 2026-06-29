/**
 * 摩托范(58moto.com) 聚合站适配器 —— 主价格源。
 *
 * 数据来源:
 *   - 全量发现: discover.js → discoverFromMotoFan() 发现新车型
 *   - 增量刷新: 本适配器对已有车型按 ref 链接逐个抓取详情页 DOM 中的"厂商指导价:¥XX"
 *
 * 用法:
 *   全量:  node server/scraper/full-scrape.mjs
 *   增量:  通过 runScrape() 定时执行(本适配器作为 PRIMARY 源)
 *
 * 注意: 需要 puppeteer (Chrome) 渲染, 不能用纯 Node fetch。
 * 部署时需在可达 58moto 的网络环境运行。
 */
import { extractPriceCNY } from './base.js';

export const brand = '__ALL__';

/** 默认 Chrome 路径, 可用 CHROME_PATH 环境变量覆盖 */
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** 带重试的页面导航, 失败返回 null */
async function gotoWithRetry(page, url, { maxRetries = 2, timeout = 15000 } = {}) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout });
      return true;
    } catch {
      if (i < maxRetries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return false;
}

/**
 * 增量刷新: 用 puppeteer 打开每个车型的 58moto 详情页, 从 DOM 提取"厂商指导价:¥XX"。
 * 与 run-once.js / scheduler.js 配合使用。
 *
 * @param {Array} models 待刷新的车型数组
 * @param {{ log?: typeof console }} opts
 * @returns {Array<{id:string, price:number, source:string}>}
 */
export async function fetchPrices(models, { log = console } = {}) {
  // 动态导入 puppeteer (仅在真正需要抓取时加载)
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    log.warn?.('[58moto] puppeteer-core 未安装, 跳过增量抓取');
    return [];
  }

  // 过滤出有 58moto ref 链接的车型
  const targets = models.filter(m => m.ref && m.ref.includes('58moto.com'));
  if (targets.length === 0) {
    log.info?.('[58moto] 无有效的58moto链接, 跳过增量抓取');
    return [];
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    log.warn?.(`[58moto] 无法启动浏览器: ${err.message}`);
    return [];
  }

  const results = [];
  let ok = 0;
  let fail = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    for (let i = 0; i < targets.length; i++) {
      const model = targets[i];
      const url = model.ref;

      try {
        const ok_nav = await gotoWithRetry(page, url);
        if (!ok_nav) { fail++; continue; }

        // 尝试多种价格提取策略
        const price = await page.evaluate(() => {
          const text = document.body.innerText;

          // 策略1: 厂商指导价
          let m = text.match(/厂商指导价[：:]\s*[¥￥]([\d,]+)/);
          if (m) return parseInt(m[1].replace(/,/g, ''));

          // 策略2: 指导价/官方指导价
          m = text.match(/(?:官方)?指导价\s*[:：]?\s*(?:￥|¥|RMB)?\s*([0-9][0-9,]{3,})/);
          if (m) return parseInt(m[1].replace(/,/g, ''));

          // 策略3: 参考价
          m = text.match(/参考价[：:]\s*[¥￥]([\d,]+)/);
          if (m) return parseInt(m[1].replace(/,/g, ''));

          // 策略4: 页面中首个 ¥X,XXX 价格
          m = text.match(/[¥￥]\s*([0-9][0-9,]{3,})/);
          if (m) return parseInt(m[1].replace(/,/g, ''));

          return null;
        });

        if (price && price > 1000 && price < 1000000) {
          results.push({ id: model.id, price, source: url });
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
        // 单个模型失败不影响整体
      }

      // 每10个车型输出一次进度
      if ((i + 1) % 10 === 0 || i === targets.length - 1) {
        log.info?.(`[58moto] 增量刷新 ${i + 1}/${targets.length}  ✅${ok} ❌${fail}`);
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }

  log.info?.(`[58moto] 增量刷新完成: ${results.length} 个价格 (${ok}成功/${fail}失败/${targets.length}总计)`);
  return results;
}
