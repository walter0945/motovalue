/**
 * 摩托范(58moto.com) 全量车型发现模块 v3。
 *
 * 策略:
 *   1. 从 DOM 链接提取品牌名+URL (最可靠, URL格式正确)
 *   2. 从 __NEXT_DATA__ 兜底, 过滤燃油品牌
 *   3. 逐个品牌页导航, 提取 /good/ 链接中的车型+价格
 *
 * 导出:
 *   - discoverFromMotoFan(browser, { log, maxBrands }) → { models, stats }
 *   - inferCategory(name) / inferDisp(name)
 */

/** 从车型名推断类别 */
export function inferCategory(name) {
  const n = name.toLowerCase();
  if (/踏板|scooter|pcx|nmax|xmax|uhr|afr|usr|赛艇|巡弋|ct\d{2,}|巧格|cygnus|jog/i.test(n)) return '踏板';
  if (/弯梁|cub|幼兽/i.test(n)) return '弯梁';
  if (/巡航|cruiser|rebel|cm\d{2,3}|闪\d|tr\d{3}|cl-c|clc|bobber|fat\s*boy|indian/i.test(n)) return '巡航';
  if (/adv|adventure|rally|拉力|dl\d{3}|vstrom|versys|tiger|trk/i.test(n)) return '拉力';
  if (/越野|enduro|motocross|exc|wr\d|crf\d|klx\d/i.test(n)) return '越野';
  if (/复古|classic|retro|vintage|cafe|scrambler/i.test(n)) return '复古';
  if (/跑车|仿赛|rr|ninja|gsx-r|cbr\d|rc\d/i.test(n)) return '跑车';
  return '街车';
}

/** 从车型名推断排量(cc) */
export function inferDisp(name) {
  const m = name.match(/(\d{3})(?:cc|SR|NK|RR|R|MT|CL|DUKE|DR|EXC|GS|GT|TRK)/i)
        || name.match(/(?:^|[^\d])([1-9]\d{2})(?:[^\d]|$)/);
  return m && parseInt(m[1]) >= 50 && parseInt(m[1]) <= 2500 ? parseInt(m[1]) : 0;
}

// ── 策略1: 从 DOM 链接提取品牌(主要, URL 格式正确) ──
async function extractBrandsFromDOM(page, log) {
  const brands = await page.evaluate(() => {
    const seen = new Set();
    const result = [];
    document.querySelectorAll('a[href*="/brand/"]').forEach(a => {
      const name = (a.textContent || '').trim();
      let href = a.getAttribute('href') || '';

      // 只取品牌子页面链接 (如 /brand/A-8.html), 跳过列表页
      const m = href.match(/\/brand\/([A-Z])-(\d+)\.html/);
      if (!m) return;

      const brandId = parseInt(m[2]);
      // 补全绝对URL
      if (!href.startsWith('http')) href = `https://www.58moto.com${href}`;

      if (name && name.length >= 2 && name.length <= 20 && !seen.has(name) && brandId) {
        seen.add(name);
        result.push({ brandId, brandName: name, url: href });
      }
    });
    return result;
  });

  log.info?.(`[发现] DOM链接提取: ${brands.length} 品牌`);
  return brands;
}

// ── 策略2: 从 __NEXT_DATA__ 提取品牌(兜底, 用于过滤燃油) ──
async function extractFuelBrandIds(page, log) {
  try {
    const ids = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;
      const d = JSON.parse(el.textContent);
      const bl = d?.props?.pageProps?.model?.brandList;
      if (!bl || !Array.isArray(bl)) return null;

      const fuelIds = new Set();
      for (const g of bl) {
        for (const b of (g.brands || [])) {
          const et = b.brandEnergyType;
          // 1=燃油, 3=燃油+电动, undefined=未知(保守保留)
          if (et === 1 || et === 3 || et === undefined || et === null) {
            fuelIds.add(b.brandId);
          }
        }
      }
      return { fuelCount: fuelIds.size, ids: [...fuelIds] };
    });

    if (ids) {
      log.info?.(`[发现] __NEXT_DATA__ 燃油品牌ID: ${ids.fuelCount} 个`);
      return new Set(ids.ids);
    }
  } catch (err) {
    log.warn?.(`[发现] __NEXT_DATA__ 燃油过滤失败: ${err.message}`);
  }
  return null;
}

// ── 从品牌页提取车型 ──
async function extractModelsFromPage(page, brandName, log) {
  // 等待异步渲染
  await new Promise(r => setTimeout(r, 1000));

  const result = await page.evaluate((brand) => {
    const items = [];
    const seen = new Set();

    // 策略A: /good/ 链接（摩托范标准车型详情页）
    document.querySelectorAll('a[href*="/good/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/good\/(\d+)\.html/);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);

      const text = (a.textContent || '').trim();
      const pm = text.match(/[¥￥]([\d,]+)(?:[~～\-]([\d,]+))?/);
      let price = 0;
      if (pm) {
        const p1 = parseInt(pm[1].replace(/,/g, ''));
        const p2 = pm[2] ? parseInt(pm[2].replace(/,/g, '')) : p1;
        price = Math.round((p1 + p2) / 2);
      }

      // 清理车型名
      let name = text
        .replace(/[¥￥][\d,~～\-]+/g, '')
        .replace(brand, '')
        .replace(/暂无报价/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (name && name.length > 1 && name.length < 40 && price >= 2000) {
        items.push({ goodId: m[1], name, price });
      }
    });

    // 策略B: 没找到 /good/ 链接时, 搜索所有带价格的链接
    if (items.length === 0) {
      document.querySelectorAll('a').forEach(a => {
        const text = (a.textContent || '').trim();
        const pm = text.match(/[¥￥]([\d,]+)/);
        if (!pm) return;
        const price = parseInt(pm[1].replace(/,/g, ''));
        if (price < 2000) return;

        const href = a.getAttribute('href') || '';
        const gm = href.match(/\/good\/(\d+)/) || href.match(/[?&]id=(\d+)/) || href.match(/\/(\d+)\.html/);
        const goodId = gm ? gm[1] : `u-${items.length}`;
        if (seen.has(goodId)) return;
        seen.add(goodId);

        let name = text.replace(/[¥￥][\d,]+/g, '').replace(brand, '').trim();
        if (name && name.length > 1 && name.length < 40) {
          items.push({ goodId, name, price });
        }
      });
    }

    return items;
  }, brandName);

  if (result.length > 0) {
    log.info?.(`    ${brandName}: ${result.length}款车型`);
  }
  return result;
}

// ── 主入口 ──

/**
 * 从摩托范发现所有燃油车型。
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ log?: typeof console, brandPageUrl?: string, maxBrands?: number }} opts
 */
export async function discoverFromMotoFan(browser, { log = console, brandPageUrl, maxBrands = 0 } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  await page.setViewport({ width: 1500, height: 1000 });

  // ── 1) 加载品牌列表页 ──
  const startUrl = brandPageUrl || 'https://www.58moto.com/brand/18/';
  log.info?.(`[发现] 加载 ${startUrl} ...`);

  let loaded = false;
  for (let retry = 3; retry > 0; retry--) {
    try {
      await page.goto(startUrl, { waitUntil: 'networkidle0', timeout: 25000 });
      loaded = true;
      break;
    } catch {
      log.warn?.(`[发现] 加载重试剩余 ${retry - 1} 次...`);
      if (retry > 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (!loaded) throw new Error('无法加载58moto品牌页(重试3次均失败)');

  log.info?.(`[发现] 页面已加载: ${await page.title()}`);

  // ── 2) 提取品牌列表(主: DOM链接; 辅: __NEXT_DATA__燃油过滤) ──
  const brandList = await extractBrandsFromDOM(page, log);
  const fuelBrandIds = await extractFuelBrandIds(page, log);

  if (brandList.length === 0) {
    log.error?.('[发现] 未能从DOM提取任何品牌!');
    await page.close();
    return { models: [], stats: { brandsOk: 0, brandsFail: 0, total: 0 } };
  }

  // 用 __NEXT_DATA__ 的燃油标记过滤(如果有的话)
  let targets = brandList;
  if (fuelBrandIds && fuelBrandIds.size > 0) {
    targets = brandList.filter(b => fuelBrandIds.has(b.brandId));
    log.info?.(`[发现] 燃油过滤后: ${targets.length} 品牌 (原${brandList.length})`);
  }

  // 限制品牌数(调试用)
  if (maxBrands > 0) {
    targets = targets.slice(0, maxBrands);
    log.info?.(`[发现] 限制为前 ${maxBrands} 个品牌`);
  }

  // ── 3) 逐个品牌页提取车型 ──
  const allModels = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < targets.length; i++) {
    const brand = targets[i];
    const pct = ((i + 1) / targets.length * 100).toFixed(0);

    if (!brand.url) { fail++; continue; }

    try {
      // 直接使用 DOM 中提取的正确 URL
      let navOk = false;
      for (let retry = 2; retry >= 0; retry--) {
        try {
          await page.goto(brand.url, { waitUntil: 'networkidle0', timeout: 15000 });
          navOk = true;
          break;
        } catch {
          if (retry > 0) await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!navOk) { fail++; continue; }

      const models = await extractModelsFromPage(page, brand.brandName, log);

      if (models && models.length > 0) {
        for (const m of models) {
          const slug = brand.brandName.replace(/[^a-z0-9]+/gi, '-').replace(/-+/g, '-');
          allModels.push({
            id: `${slug}-${m.goodId}`,
            brand: brand.brandName,
            name: m.name,
            category: inferCategory(m.name),
            displacement: inferDisp(m.name),
            price: m.price,
            tier: 'DOMESTIC_TOP',
            emission: '国四',
            source: `https://www.58moto.com/good/${m.goodId}.html`,
            ref: `https://www.58moto.com/good/${m.goodId}.html`,
            priceVerified: true,
            updatedAt: new Date().toISOString().slice(0, 10),
          });
        }
        ok++;
        log.info?.(`  ${pct}% ${brand.brandName}: ${models.length}款 ✅${ok} ❌${fail}`);
      } else {
        fail++;
        log.info?.(`  ${pct}% ${brand.brandName}: 0款 ❌ (✅${ok} ❌${fail})`);
      }
    } catch (err) {
      fail++;
      log.warn?.(`  ${pct}% ${brand.brandName}: 异常 — ${err.message}`);
    }
  }

  await page.close();

  return {
    models: allModels,
    stats: { brandsOk: ok, brandsFail: fail, total: allModels.length },
  };
}
