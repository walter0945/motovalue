/**
 * CLI 入口: 手动跑一轮抓取(npm run scrape)。
 * 用于调试适配器或在部署后手动刷新价格。
 *
 * 用法:
 *   node server/scraper/run-once.js                        → 仅增量刷新
 *   node server/scraper/run-once.js --discover              → 含摩托范全量发现
 *   node server/scraper/run-once.js --discover --max-brands=5  → 仅发现前5个品牌(测试用)
 */
import { runScrape } from './index.js';

const discover = process.argv.includes('--discover');
const maxBrandsArg = process.argv.find(a => a.startsWith('--max-brands='));
const maxBrands = maxBrandsArg ? parseInt(maxBrandsArg.split('=')[1]) : 0;

console.info(`[CLI] 启动抓取 ${discover ? '(含全量发现)' : '(仅增量刷新)'}${maxBrands > 0 ? ` 限制${maxBrands}品牌` : ''} ...`);

runScrape({ discover, maxBrands })
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('抓取失败:', err.message);
    process.exit(1);
  });
