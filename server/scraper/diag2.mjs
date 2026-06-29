/**
 * 快速诊断: 检查 __NEXT_DATA__ 中品牌对象完整字段 + URL格式验证
 */
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

// 加载品牌页
await page.goto('https://www.58moto.com/brand/18/', { waitUntil: 'networkidle0', timeout: 20000 });

// 1) 完整品牌对象字段
const brandSample = await page.evaluate(() => {
  const el = document.getElementById('__NEXT_DATA__');
  const d = JSON.parse(el.textContent);
  const bl = d?.props?.pageProps?.model?.brandList || [];
  const samples = [];
  for (const g of bl.slice(0, 3)) {
    for (const b of (g.brands || []).slice(0, 3)) {
      samples.push(b);
    }
  }
  return { totalGroups: bl.length, groupKeys: bl.length > 0 ? Object.keys(bl[0]) : [], sampleBrands: samples };
});
console.log('=== 品牌对象完整字段 ===');
console.log(JSON.stringify(brandSample, null, 2));

// 2) 验证URL格式
const urlTest = await page.evaluate(() => {
  // 找所有品牌链接，按首字母分组展示格式
  const formats = new Map();
  document.querySelectorAll('a[href*="/brand/"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/brand\/([A-Z])-(\d+)\.html/);
    if (m) {
      const key = `/${m[1]}-{id}.html`;
      if (!formats.has(key)) formats.set(key, []);
      formats.get(key).push({ name: a.textContent.trim(), href });
    }
  });
  // 也检查数字格式
  document.querySelectorAll('a[href*="/brand/"]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (/\/brand\/\d+/.test(href) && !href.includes('-')) {
      const key = '/{id}';
      if (!formats.has(key)) formats.set(key, []);
      formats.get(key).push(href);
    }
  });
  return Object.fromEntries(formats);
});
console.log('\n=== URL格式分布 ===');
console.log(JSON.stringify(urlTest, null, 2));

// 3) 检查几个燃油品牌 (本田/豪爵/春风) 的URL
const knownBrands = await page.evaluate(() => {
  const targets = ['本田', '豪爵', '春风', '雅马哈', '川崎', '宝马', '钱江', '无极'];
  const found = [];
  document.querySelectorAll('a[href*="/brand/"]').forEach(a => {
    const name = a.textContent.trim();
    if (targets.includes(name)) {
      found.push({ name, href: a.getAttribute('href') });
    }
  });
  return found;
});
console.log('\n=== 已知品牌URL ===');
console.log(JSON.stringify(knownBrands, null, 2));

// 4) 验证 oilEnergyType 字段
const energyTypes = await page.evaluate(() => {
  const el = document.getElementById('__NEXT_DATA__');
  const d = JSON.parse(el.textContent);
  const bl = d?.props?.pageProps?.model?.brandList || [];
  const types = new Set();
  const samples = {};
  for (const g of bl) {
    for (const b of (g.brands || [])) {
      const et = b.brandEnergyType ?? b.energyType ?? b.oilEnergyType ?? 'undefined';
      types.add(String(et));
      if (!samples[String(et)]) samples[String(et)] = [];
      if (samples[String(et)].length < 3) samples[String(et)].push(b.brandName);
    }
  }
  return { uniqueTypes: [...types], samples };
});
console.log('\n=== brandEnergyType 值分布 ===');
console.log(JSON.stringify(energyTypes, null, 2));

await browser.close();
console.log('\n✅ 诊断2完成');
