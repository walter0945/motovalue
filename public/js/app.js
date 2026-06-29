/**
 * 前端估价逻辑 —— 拉取车型/选项, 提交估价, 渲染可解释结果。
 */
'use strict';

// $ / fmt / api 由 common.js 提供
let MODELS = [];

function fillSelect(el, items) {
  el.innerHTML = items.map((v) => `<option value="${v}">${v}</option>`).join('');
}

/** 根据已选品牌刷新车型下拉。 */
function refreshModels() {
  const brand = $('brand').value;
  const list = MODELS.filter((m) => m.brand === brand);
  $('model').innerHTML = list
    .map((m) => `<option value="${m.id}">${m.name}（${m.category} · ${m.displacement}cc）</option>`)
    .join('');
  refreshNewPrice();
}

function refreshNewPrice() {
  const model = MODELS.find((m) => m.id === $('model').value);
  if (model) {
    $('newPriceHint').textContent = `新车指导价基准：${fmt(model.price)}　·　默认排放：${model.emission}`;
    $('emission').value = model.emission;
  }
}

/** 初始化: 加载品牌、车型、表单选项。 */
async function init() {
  try {
    const [models, options] = await Promise.all([api('/api/models'), api('/api/options')]);
    MODELS = models;

    const brands = [...new Set(models.map((m) => m.brand))];
    fillSelect($('brand'), brands);

    for (const key of Object.keys(options)) {
      if ($(key)) fillSelect($(key), options[key]);
    }

    $('brand').addEventListener('change', refreshModels);
    $('model').addEventListener('change', refreshNewPrice);
    $('submit').addEventListener('click', onSubmit);
    $('reloadData').addEventListener('click', async () => {
      const btn = $('reloadData');
      btn.disabled = true;
      btn.textContent = '⏳ 加载中...';
      try {
        await api('/api/reload', { method: 'POST' });
        const models = await api('/api/models');
        MODELS = models;
        const brands = [...new Set(models.map((m) => m.brand))];
        fillSelect($('brand'), brands);
        refreshModels();
        btn.textContent = `✅ ${models.length}款车型`;
      } catch (err) {
        btn.textContent = '❌ 失败';
        alert('刷新失败: ' + err.message);
      }
      setTimeout(() => { btn.disabled = false; btn.textContent = '🔄 刷新车型'; }, 2000);
    });

    refreshModels();
  } catch (err) {
    alert(`初始化失败：${err.message}`);
  }
}

/** 收集表单 -> 调估价 -> 渲染。 */
async function onSubmit() {
  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = '估价中…';
  try {
    const payload = {
      modelId: $('model').value,
      ageYears: Number($('ageYears').value),
      mileageKm: Number($('mileageKm').value),
      appearance: $('appearance').value,
      mechanical: $('mechanical').value,
      accident: $('accident').value,
      modification: $('modification').value,
      maintenance: $('maintenance').value,
      transfer: $('transfer').value,
      emission: $('emission').value,
      docs: $('docs').value,
      region: $('region').value,
    };
    const result = await api('/api/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const xy = await loadXianyu(result.model);
    render(result, xy);
  } catch (err) {
    alert(`估价失败：${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始估价';
  }
}

async function loadXianyu(model) {
  try {
    const xy = await api(`/api/xianyu/${model.id}?ageYears=${$('ageYears').value}&mileageKm=${$('mileageKm').value}`);
    return xy;
  } catch { return null; }
}

function render(r, xy) {
  $('result').hidden = false;
  $('resultTitle').textContent = `${r.model.brand} ${r.model.name} · 估价结果`;
  $('priceFair').textContent = fmt(r.price.fair);
  $('priceListing').textContent = fmt(r.price.listing);
  $('priceQuick').textContent = fmt(r.price.quickSale);

  $('warnings').innerHTML = (r.warnings || []).map((w) => `<div>${w}</div>`).join('');

  $('breakdown').innerHTML = r.breakdown
    .map((b) => {
      const hint = b.hint ? `<span class="hint">${b.hint}</span>` : '';
      return `<tr><td>${b.key}${hint}</td><td>${b.value}</td></tr>`;
    })
    .join('');

  const s = r.priceSource || {};
  const verified = s.verified ? '已核实' : '待核实/检索值';
  $('sourceLine').innerHTML = `基准价来源：<a href="${s.url}" target="_blank" rel="noopener">官方页面</a>　·　更新于 ${s.updatedAt}　·　${verified}`;
  $('disclaimer').textContent = r.disclaimer || '';

  // —— 闲鱼比价 ——
  if (xy) {
    $('xianyuBox').hidden = false;
    $('xyAvg').textContent = fmt(xy.median);
    $('xyMin').textContent = fmt(xy.min);
    $('xyMax').textContent = fmt(xy.max);
    const ourFair = r.price.fair;
    const diff = ((ourFair - xy.median) / xy.median * 100).toFixed(0);
    const diffAbs = Math.abs(diff);
    let verdict, color;
    if (diffAbs < 8) { verdict = `本估价与闲鱼行情接近，价差仅 ${diffAbs}%`; color = 'var(--accent2)'; }
    else if (diff > 0) { verdict = `本估价高于闲鱼行情 ${diffAbs}%，建议参考行情微调定价`; color = 'var(--warn)'; }
    else { verdict = `本估价低于闲鱼行情 ${diffAbs}%，性价比高`; color = 'var(--accent2)'; }
    $('xyCompare').innerHTML = `<span style="color:${color}">${verdict}</span>`;
    $('xyNote').textContent = xy.note || (xy.source === 'heuristic' ? '行情估算(当前网络不可达闲鱼, 经验模型兜底)' : '');
  } else { $('xianyuBox').hidden = true; }

  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

init();

// ═══ 模式切换 ═══

$('modeTabs').addEventListener('click', (e) => {
  if (!e.target.classList.contains('mode-tab')) return;
  const mode = e.target.dataset.mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  e.target.classList.add('active');
  $('panelDb').style.display = mode === 'db' ? '' : 'none';
  $('panelManual').style.display = mode === 'manual' ? '' : 'none';
});

// ═══ 品牌系数推断(客户端) ═══

const BRAND_COEF = {
  'honda':0.85,'本田':0.85,'kawasaki':0.88,'川崎':0.88,'yamaha':0.88,'雅马哈':0.88,
  'harley':0.88,'哈雷':0.88,'bmw':0.93,'宝马':0.93,'haojue':0.95,'豪爵':0.95,
  'ktm':1.0,'cfmoto':1.0,'春风':1.0,'kymco':0.98,'光阳':0.98,'sym':0.98,'三阳':0.98,
  'benelli':1.06,'贝纳利':1.06,'qjmotor':1.06,'钱江':1.06,'voge':1.06,'无极':1.06,
  'kayo':1.08,'凯越':1.08,'triumph':0.9,'凯旋':0.9,
  'sundiro':1.0,'新大洲':1.0,'jn-suzuki':0.95,'济南铃木':0.95,
  'zontes':1.0,'升仕':1.0,'zhangxue':1.0,'张雪':1.0,'mbp':1.02,'gaojin':1.02,'高金':1.02,
  'lambretta':1.0,'aprilia':0.95,'阿普利亚':0.95,'piaggio':0.93,'比亚乔':0.93,
  'zongshen':1.0,'宗申':1.0,
};
const TIER_COEF = { 'IMPORT_PREMIUM':0.9, 'JOINT_VENTURE':0.95, 'DOMESTIC_TOP':1.0, 'DOMESTIC_MID':1.06 };

function lookupBrandCoef(brand) {
  if (!brand) return null;
  const b = brand.toLowerCase();
  for (const [k, v] of Object.entries(BRAND_COEF)) {
    if (b === k || b.includes(k) || k.includes(b)) return v;
  }
  return null;
}

$('mBrand').addEventListener('blur', () => {
  const brand = $('mBrand').value.trim();
  if (!brand) return;
  const coef = lookupBrandCoef(brand);
  const hint = document.getElementById('brandCoefHint') || (() => {
    const h = document.createElement('div'); h.id = 'brandCoefHint';
    h.style.cssText = 'font-size:12px;margin:4px 0 8px';
    $('mBrand').parentElement.appendChild(h);
    return h;
  })();
  if (coef !== null) {
    hint.textContent = '| 品牌系数: ' + coef + ' (' + (coef<1?'较保值':coef>1?'贬值较快':'标准') + ')';
    hint.style.color = 'var(--accent2)';
  } else {
    hint.textContent = '| 未知品牌, 将按档次推算';
    hint.style.color = 'var(--warn)';
  }
});

// ═══ 手动估价 ═══

$('submitManual').addEventListener('click', async () => {
  const btn = $('submitManual');
  const price = Number($('mPrice').value);
  if (!price || price <= 0) { alert('请输入有效的新车指导价'); return; }

  btn.disabled = true; btn.textContent = '计算中...';
  try {
    const brand = $('mBrand').value.trim() || '自定义车型';
    let coef = lookupBrandCoef(brand);
    if (coef === null) coef = TIER_COEF[$('mTier').value] || 1.0;

    const model = {
      id: 'custom',
      brand: brand,
      name: $('mName').value.trim() || '未命名',
      category: $('mCategory').value,
      price: price,
      tier: $('mTier').value,
      displacement: Number($('mDisplacement').value) || 0,
      emission: $('mEmission').value,
    };

    const input = {
      ageYears: Number($('mAge').value),
      mileageKm: Number($('mMileage').value),
      appearance: $('mAppearance').value,
      mechanical: $('mMechanical').value,
      accident: $('mAccident').value,
      modification: $('mModification').value,
      maintenance: $('mMaintenance').value,
      transfer: $('mTransfer').value,
      emission: $('mEmission').value,
      docs: $('mDocs').value,
      region: $('mRegion').value,
    };

    const result = await api('/api/valuation/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    });

    result.breakdown[2].hint += ' | 品牌系数: ' + coef;
    result.priceSource = { url: '', updatedAt: new Date().toISOString().slice(0,10), verified: false };
    render(result, null);
    $('xianyuBox').hidden = true;
  } catch (err) { alert('估价失败: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = '计算二手估价'; }
});
