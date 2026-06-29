/**
 * 发布页: 选车型+车况 -> 估价 -> 定价 -> 发布。
 * 估价结果与卖家定价一并提交, 服务端再次校验生成估价快照。
 */
'use strict';

let MODELS = [];

function fillSelect(el, items) {
  el.innerHTML = items.map((v) => `<option value="${v}">${v}</option>`).join('');
}

function refreshModels() {
  const brand = $('brand').value;
  const list = MODELS.filter((m) => m.brand === brand);
  $('model').innerHTML = list
    .map((m) => `<option value="${m.id}">${m.name}（${m.category} · ${m.displacement}cc）</option>`)
    .join('');
  refreshNewPrice();
}

function refreshNewPrice() {
  const m = MODELS.find((x) => x.id === $('model').value);
  if (m) {
    $('newPriceHint').textContent = `新车指导价基准：${fmt(m.price)}　·　默认排放：${m.emission}`;
    $('emission').value = m.emission;
  }
}

/** 收集车况字段(估价与发布共用)。 */
function collect() {
  return {
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
}

async function onEstimate() {
  try {
    const r = await api('/api/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    });
    $('suggest').hidden = false;
    $('suggest').innerHTML =
      `科学估价区间：急售 <b>${fmt(r.price.quickSale)}</b>　·　预期成交 <b>${fmt(r.price.fair)}</b>　·　挂牌 <b>${fmt(r.price.listing)}</b>` +
      (r.warnings.length ? `<br>${r.warnings.join('<br>')}` : '');
    if (!$('askingPrice').value) $('askingPrice').value = r.price.fair;
  } catch (err) {
    alert(`估价失败：${err.message}`);
  }
}

async function onPublish() {
  if (!$('contact').value.trim()) {
    alert('请填写联系方式');
    return;
  }
  const btn = $('publish');
  btn.disabled = true;
  btn.textContent = '发布中…';
  try {
    const payload = {
      ...collect(),
      ownerToken: ownerToken(),
      askingPrice: Number($('askingPrice').value) || undefined,
      city: $('city').value.trim(),
      title: $('title').value.trim(),
      contact: $('contact').value.trim(),
      description: $('description').value.trim(),
    };
    const rec = await api('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    location.href = `/listing.html?id=${rec.id}`;
  } catch (err) {
    alert(`发布失败：${err.message}`);
    btn.disabled = false;
    btn.textContent = '② 发布到市场';
  }
}

async function init() {
  try {
    const [models, options] = await Promise.all([api('/api/models'), api('/api/options')]);
    MODELS = models;
    fillSelect($('brand'), [...new Set(models.map((m) => m.brand))]);
    for (const key of Object.keys(options)) if ($(key)) fillSelect($(key), options[key]);
    $('brand').addEventListener('change', refreshModels);
    $('model').addEventListener('change', refreshNewPrice);
    $('estimate').addEventListener('click', onEstimate);
    $('publish').addEventListener('click', onPublish);
    refreshModels();
  } catch (err) {
    alert(`初始化失败：${err.message}`);
  }
}

init();
