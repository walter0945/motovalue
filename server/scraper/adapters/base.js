/**
 * 抓取适配器接口约定。
 *
 * 每个品牌实现一个适配器, 导出:
 *   - brand: 品牌显示名(需与数据库 model.brand 对应)
 *   - fetchPrices(models): 接收该品牌车型数组, 返回 [{ id, price, source }]
 *
 * 约定: 抓取必须"尽力而为"且永不抛出致命错误。
 * 任一车型抓取失败应跳过(返回中不含该项), 上层会保留库存价。
 *
 * 注意: 多数国内 OEM 站点对非本地网络有超时/反爬, 部署到可达网络(建议国内机房)才能稳定抓取。
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 带超时与 UA 的安全抓取, 失败返回 null 而非抛出。 */
export async function safeFetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null; // 网络错误/超时/被拒 -> 交由上层回退种子价
  } finally {
    clearTimeout(timer);
  }
}

/** 带重试的抓取(应对国内站点偶发超时)。可用环境变量覆盖默认值。 */
export async function fetchWithRetry(
  url,
  {
    timeoutMs = Number(process.env.SCRAPE_TIMEOUT_MS) || 12000,
    retries = process.env.SCRAPE_RETRIES != null ? Number(process.env.SCRAPE_RETRIES) : 2,
  } = {},
) {
  for (let i = 0; i <= retries; i++) {
    const html = await safeFetchText(url, timeoutMs);
    if (html) return html;
    if (i < retries) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

/**
 * 从 HTML/文本中提取人民币价格(元)。
 * 策略: 优先取"指导价/官方价"紧邻的数字; 否则在所有价格候选里取众数(最常出现的价格),
 * 以规避页面上促销价、配件价等干扰。
 */
export function extractPriceCNY(text) {
  if (!text) return null;
  const plausible = (n) => Number.isFinite(n) && n >= 2000 && n <= 2000000;
  const toNum = (s) => Number(String(s).replace(/,/g, ''));

  // 1) 优先: "指导价/官方指导价/厂商指导价 12,800"
  const guide = text.match(/(?:厂商|官方)?指导价\s*[:：]?\s*(?:￥|¥|RMB)?\s*([0-9][0-9,]{3,})/);
  if (guide && plausible(toNum(guide[1]))) return toNum(guide[1]);

  // 2) 收集所有价格关键字旁的候选, 取众数(并列时取较大值, 更接近整车价)
  const re = /(?:售价|参考价|价格|￥|¥)\s*[:：]?\s*([0-9][0-9,]{3,})/g;
  const counts = new Map();
  for (const m of text.matchAll(re)) {
    const v = toNum(m[1]);
    if (plausible(v)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * 通用实现: 按每个车型的 source 链接抓取并提取价格。
 * 各品牌适配器只需提供品牌名与域名前缀, 复用此函数即可;
 * 站点结构特殊时可在对应适配器内覆盖。
 * @param {Array} models 该品牌车型
 * @param {string} domain 仅抓取链接含此域名的车型(防止误抓)
 * @param {string} field 取链接的字段名: 'source'(官网) 或 'ref'(摩托范等聚合站)
 */
export async function fetchPricesBySource(models, domain, field = 'source') {
  const results = [];
  for (const model of models) {
    const url = model[field];
    if (!url || !url.includes(domain)) continue;
    const html = await fetchWithRetry(url);
    const price = extractPriceCNY(html);
    if (price) results.push({ id: model.id, price, source: url });
  }
  return results;
}
