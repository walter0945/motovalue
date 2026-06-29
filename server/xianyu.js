/**
 * 闲鱼(goofish)二手价参考模块。
 *
 * 闲鱼无公开 API, 且反爬严格, 本模块提供:
 *   1. fetchXianyuRange(model) —— 尽力抓取闲鱼在售均价/最低/数量
 *   2. heuristicRange(model, age, km) —— 行情估算(基于品类折扣经验+里程阶梯)
 *
 * 调度逻辑: 先试抓取, 失败则回退行情估算并标记 source:'heuristic'。
 * 适配部署到可达网络时可完整生效; 本地开发用估算兜底(仍可展示对比UI)。
 */
import { fetchWithRetry } from './scraper/adapters/base.js';

// 类别二手均价相对新车指导价的折扣率(经验值, 1~3年车龄参考)
const CATEGORY_USED_RATIO = Object.freeze({
  踏板: 0.62, 弯梁: 0.52, 街车: 0.60, 跑车: 0.63,
  复古: 0.68, 拉力: 0.65, 巡航: 0.66, 越野: 0.50,
});

/** 从闲鱼搜索页提取价格(尽力)。 */
async function fetchFromXianyu(searchUrl) {
  const html = await fetchWithRetry(searchUrl, { timeoutMs: 10000, retries: 1 });
  if (!html) return null;
  const prices = [];
  // 闲鱼页面中价格常见格式: "¥ X,XXX" 或 price 字段
  const re = /[¥￥]\s*([0-9][0-9,]{2,})/g;
  for (const m of html.matchAll(re)) {
    const v = Number(m[1].replace(/,/g, ''));
    if (v >= 500 && v <= 500000) prices.push(v);
  }
  if (prices.length < 3) return null;
  prices.sort((a, b) => a - b);
  return {
    median: prices[Math.floor(prices.length / 2)],
    min: prices[0],
    max: prices[prices.length - 1],
    count: prices.length,
    source: 'xianyu_fetch',
  };
}

/** 行情估算(经验模型, 用于抓取不可达时的兜底)。 */
function heuristicRange(model, age, km) {
  const ratio = CATEGORY_USED_RATIO[model.category] ?? 0.6;
  let base = model.price * ratio;

  // 年限修正
  if (age <= 1) base *= 1.06;
  else if (age <= 3) base *= 1.0;
  else if (age <= 5) base *= 0.88;
  else if (age <= 8) base *= 0.72;
  else base *= 0.5;

  // 里程阶梯
  const annual = km / Math.max(age, 0.5);
  if (annual < 4000) base *= 1.04;
  else if (annual < 8000) base *= 1.0;
  else if (annual < 15000) base *= 0.92;
  else base *= 0.84;

  const fair = Math.round(base / 500) * 500;
  return {
    median: fair,
    min: Math.round(fair * 0.85 / 500) * 500,
    max: Math.round(fair * 1.2 / 500) * 500,
    count: null,
    source: 'heuristic',
  };
}

/**
 * 获取闲鱼二手行情。
 * @returns {{ median, min, max, count, source, note? }}
 */
export async function getXianyuRange(model, { ageYears, mileageKm } = {}) {
  // 1) 尝试构造闲鱼搜索 URL 并发起抓取
  const query = encodeURIComponent(`${model.brand} ${model.name}`.replace(/\s+/g, ' ').trim());
  const searchUrl = `https://s.2.taobao.com/list/list.htm?q=${query}&search_type=item`;
  const fetched = await fetchFromXianyu(searchUrl);
  if (fetched) return fetched;

  // 2) 抓取失败 -> 行情估算
  const heuristic = heuristicRange(model, Number(ageYears) || 2, Number(mileageKm) || 10000);
  return {
    ...heuristic,
    note: '当前网络无法访问闲鱼, 为行情估算值, 仅供参考',
  };
}
