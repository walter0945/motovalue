/**
 * 摩托范发现诊断工具 —— 逐步检查每个环节是否正常。
 * 用法: node server/scraper/diag.mjs
 */
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const STEP = (n, title) => console.log(`\n${'='.repeat(60)}\n[步骤${n}] ${title}\n${'='.repeat(60)}`);

// ── 步骤1: 启动浏览器 ──
STEP(1, '启动浏览器');
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  console.log('✅ 浏览器启动成功');
} catch (e) {
  console.error('❌ 浏览器启动失败:', e.message);
  console.log('   请检查 CHROME_PATH 或安装 Chrome');
  process.exit(1);
}

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

// ── 步骤2: 加载品牌页 ──
STEP(2, '加载品牌页 https://www.58moto.com/brand/18/');
try {
  await page.goto('https://www.58moto.com/brand/18/', { waitUntil: 'networkidle0', timeout: 20000 });
  console.log('✅ 品牌页加载成功');
  console.log('   当前URL:', page.url());
  console.log('   页面标题:', await page.title());
} catch (e) {
  console.error('❌ 品牌页加载失败:', e.message);
  await browser.close();
  process.exit(1);
}

// ── 步骤3: 检查 __NEXT_DATA__ ──
STEP(3, '检查 __NEXT_DATA__ 数据结构');
const nextDataRaw = await page.evaluate(() => {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return { found: false, hint: '未找到 #__NEXT_DATA__ 元素, 站点可能已改用其他框架' };
  try {
    const d = JSON.parse(el.textContent);
    // 只取前几层结构, 避免输出过大
    const summarize = (obj, depth) => {
      if (depth > 3) return typeof obj === 'object' && obj !== null ? (Array.isArray(obj) ? `Array(${obj.length})` : 'Object') : obj;
      if (Array.isArray(obj)) return obj.slice(0, 3).map(x => summarize(x, depth + 1));
      if (typeof obj === 'object' && obj !== null) {
        const out = {};
        for (const [k, v] of Object.entries(obj).slice(0, 10)) out[k] = summarize(v, depth + 1);
        return out;
      }
      return obj;
    };
    return { found: true, keys: Object.keys(d), props: summarize(d.props, 1) };
  } catch (e) {
    return { found: true, parseError: e.message, rawPreview: el.textContent.slice(0, 500) };
  }
});
console.log(JSON.stringify(nextDataRaw, null, 2));

// ── 步骤4: 尝试提取品牌列表 ──
STEP(4, '尝试多种策略提取品牌列表');
const brandAttempts = await page.evaluate(() => {
  const results = {};

  // 策略A: __NEXT_DATA__
  try {
    const el = document.getElementById('__NEXT_DATA__');
    if (el) {
      const d = JSON.parse(el.textContent);
      const bl = d?.props?.pageProps?.model?.brandList;
      if (bl && Array.isArray(bl)) {
        const brands = [];
        for (const g of bl) for (const b of (g.brands || [])) brands.push(b.brandName);
        results.strategyA_NEXT_DATA = { groupCount: bl.length, brandCount: brands.length, sample: brands.slice(0, 10) };
      } else {
        // 尝试其他路径
        const alt = [];
        JSON.stringify(d, (k, v) => {
          if (v && typeof v === 'object' && v.brandName && v.brandId) alt.push(v.brandName);
          return v;
        });
        results.strategyA_NEXT_DATA = { error: 'props.pageProps.model.brandList not found', altMatches: alt.length, altSample: alt.slice(0, 10) };
      }
    } else {
      results.strategyA_NEXT_DATA = { error: 'no __NEXT_DATA__ element' };
    }
  } catch (e) {
    results.strategyA_NEXT_DATA = { error: e.message };
  }

  // 策略B: DOM中的品牌链接
  const brandLinks = [];
  document.querySelectorAll('a[href*="/brand/"]').forEach(a => {
    const name = a.textContent.trim();
    const href = a.getAttribute('href');
    if (name && name.length >= 2 && name.length <= 20) brandLinks.push({ name, href });
  });
  results.strategyB_DOM_links = { count: brandLinks.length, sample: brandLinks.slice(0, 15) };

  // 策略C: 侧边栏中的可点击元素
  const clickables = [];
  document.querySelectorAll('[class*="brand"], [class*="Brand"], [class*="side"], [class*="menu"], [class*="list"] a, li, span').forEach(el => {
    const t = el.textContent.trim();
    if (t && t.length >= 2 && t.length <= 20 && el.onclick) clickables.push(t);
  });
  results.strategyC_clickable = { count: clickables.length, sample: clickables.slice(0, 15) };

  // 策略D: 页面上所有短文本节点(可能是品牌名)
  const texts = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent.trim();
    if (t.length >= 2 && t.length <= 15 && !/[，。！？；：""''（）]/.test(t)) texts.add(t);
  }
  results.strategyD_textNodes = { count: texts.size, sample: [...texts].slice(0, 30) };

  return results;
});
console.log(JSON.stringify(brandAttempts, null, 2));

// ── 步骤5: 尝试直接加载一个品牌页 ──
STEP(5, '尝试直接加载品牌子页面');
// 从步骤4的结果中找品牌链接
const testUrls = [];
if (brandAttempts.strategyB_DOM_links?.sample?.length > 0) {
  for (const link of brandAttempts.strategyB_DOM_links.sample.slice(0, 3)) {
    const url = link.href.startsWith('http') ? link.href : `https://www.58moto.com${link.href}`;
    testUrls.push({ name: link.name, url });
  }
}
if (testUrls.length === 0) {
  // 硬编码几个常见品牌URL作为回退
  testUrls.push(
    { name: 'Honda', url: 'https://www.58moto.com/brand/B-1.html' },
    { name: '春风', url: 'https://www.58moto.com/brand/B-470.html' },
  );
}

for (const { name, url } of testUrls) {
  console.log(`\n  尝试: ${name} → ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    console.log(`  ✅ 加载成功, 当前URL: ${page.url()}`);

    // 提取车型
    const models = await page.evaluate((brand) => {
      const items = [];
      const seen = new Set();
      // 策略1: /good/ 链接
      document.querySelectorAll('a[href*="/good/"]').forEach(a => {
        const m = a.getAttribute('href').match(/\/good\/(\d+)\.html/);
        if (!m || seen.has(m[1])) return;
        seen.add(m[1]);
        const text = a.textContent.trim();
        const pm = text.match(/[¥￥]([\d,]+)(?:[~～\-]([\d,]+))?/);
        const price = pm ? parseInt(pm[1].replace(/,/g, '')) : 0;
        let modelName = text.replace(/[¥￥][\d,~～\-]+/g, '').replace(brand, '').replace(/暂无报价/g, '').trim();
        if (modelName && modelName.length > 1 && modelName.length < 40) {
          items.push({ goodId: m[1], name: modelName, price });
        }
      });
      // 策略2: 查找所有带价格的卡片
      if (items.length === 0) {
        document.querySelectorAll('[class*="card"], [class*="item"], [class*="list"] li, [class*="good"]').forEach(el => {
          const text = el.textContent.trim();
          const pm = text.match(/[¥￥]([\d,]+)/);
          if (pm) {
            const idMatch = el.innerHTML.match(/\/good\/(\d+)/);
            items.push({
              goodId: idMatch ? idMatch[1] : 'unknown',
              name: text.slice(0, 40),
              price: parseInt(pm[1].replace(/,/g, '')),
            });
          }
        });
      }
      return items;
    }, name);

    console.log(`  车型数: ${models.length}`);
    if (models.length > 0) console.log(`  示例:`, JSON.stringify(models.slice(0, 5)));
    else {
      // dump页面结构帮助诊断
      const structure = await page.evaluate(() => {
        const bodyClasses = document.body.className;
        const mainLinks = [...document.querySelectorAll('a')].slice(0, 30).map(a => ({
          href: a.getAttribute('href')?.slice(0, 80),
          text: a.textContent.trim().slice(0, 40),
        }));
        const hasGoodLinks = [...document.querySelectorAll('a')].some(a => a.getAttribute('href')?.includes('/good/'));
        return { bodyClasses, hasGoodLinks, sampleLinks: mainLinks };
      });
      console.log('  页面结构:', JSON.stringify(structure, null, 2));
    }
  } catch (e) {
    console.log(`  ❌ 失败: ${e.message}`);
  }
}

// ── 步骤6: 检查 Chrome 网络能力 ──
STEP(6, '网络连通性检查');
const netTests = await page.evaluate(async () => {
  const results = {};
  for (const url of ['https://www.58moto.com/', 'https://www.baidu.com/']) {
    try {
      const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      results[url] = 'reachable';
    } catch (e) {
      results[url] = `unreachable: ${e.message}`;
    }
  }
  return results;
});
console.log(JSON.stringify(netTests, null, 2));

await browser.close();
console.log('\n✅ 诊断完成。请将以上输出发给开发者分析。');
