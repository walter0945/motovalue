/**
 * 摩托范(58moto.com) 全量燃油摩托车抓取器 v5。
 *
 * 策略: 复用 discover.js 发现模块, 写入种子文件。
 *
 * 用法: node server/scraper/full-scrape.mjs
 */

import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { discoverFromMotoFan } from './discover.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '..', '..', 'data', 'models.seed.json');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

console.log('🚀 摩托范全量抓取 v5...\n');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

try {
  const { models, stats } = await discoverFromMotoFan(browser, { log: console });

  await browser.close();

  console.log(`\n保存 ${models.length} 款车型...`);
  const cats = {};
  for (const m of models) cats[m.category] = (cats[m.category] || 0) + 1;
  const brands = {};
  for (const m of models) brands[m.brand] = (brands[m.brand] || 0) + 1;

  const seed = {
    meta: {
      note: `58moto全量抓取 v5 (${new Date().toISOString().slice(0, 10)})。重跑: node server/scraper/full-scrape.mjs`,
      tiers: {
        IMPORT_PREMIUM: { label: '进口高端', factor: 1.10 },
        JOINT_VENTURE: { label: '合资主流', factor: 1.05 },
        DOMESTIC_TOP: { label: '国产一线', factor: 1.0 },
        DOMESTIC_MID: { label: '国产二线', factor: 0.95 },
      },
      updatedAt: new Date().toISOString().slice(0, 10),
    },
    models,
  };
  await writeFile(SEED_PATH, JSON.stringify(seed, null, 2), 'utf-8');
  console.log(`✅ ${models.length}款车型 | ${stats.brandsOk}品牌成功 | ${stats.brandsFail}品牌失败`);
  console.log('类别:', JSON.stringify(cats));
  console.log('TOP15:');
  Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([n, c]) => console.log(`  ${n}: ${c}款`));
} catch (e) {
  console.error('失败:', e.message);
  await browser.close();
  process.exit(1);
}
