/**
 * 市场页: 加载车源、筛选、渲染卡片、收藏。
 * ?mine=1 时仅显示当前用户(ownerToken)发布的车源。
 */
'use strict';

const MINE = new URLSearchParams(location.search).get('mine') === '1';
const CATEGORIES = ['街车', '跑车', '踏板', '复古', '弯梁', '拉力', '巡航', '越野'];

/** 卖家定价相对科学估价的徽章。 */
function priceBadge(asking, fair) {
  if (!fair) return '';
  if (asking <= fair * 0.97) return '<span class="badge good">低于估价 · 实惠</span>';
  if (asking >= fair * 1.12) return '<span class="badge high">高于估价</span>';
  return '<span class="badge good">接近估价</span>';
}

function card(l) {
  const fav = isFavorite(l.id) ? 'on' : '';
  const heart = isFavorite(l.id) ? '♥' : '♡';
  return `
    <div class="listing-card" data-id="${l.id}">
      <button class="fav-btn ${fav}" data-fav="${l.id}" title="收藏">${heart}</button>
      <div class="lc-title">${l.title}</div>
      <div class="lc-meta">${l.brand} ${l.modelName} · ${l.ageYears}年 · ${l.mileageKm.toLocaleString()}km · ${l.emission}${l.city ? ' · ' + l.city : ''}</div>
      <div class="lc-price">${fmt(l.askingPrice)}</div>
      <div class="lc-val">科学估价 ${fmt(l.valuation.price.fair)}</div>
      ${priceBadge(l.askingPrice, l.valuation.price.fair)}
    </div>`;
}

function bindCards() {
  document.querySelectorAll('.listing-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.fav) return; // 点收藏不跳转
      location.href = `/listing.html?id=${el.dataset.id}`;
    });
  });
  document.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const on = toggleFavorite(btn.dataset.fav);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '♥' : '♡';
    });
  });
}

async function loadList() {
  const params = new URLSearchParams();
  const brand = $('fBrand').value;
  const category = $('fCategory').value;
  const maxPrice = $('fMaxPrice').value;
  if (brand) params.set('brand', brand);
  if (category) params.set('category', category);
  if (maxPrice) params.set('maxPrice', maxPrice);
  if (MINE) params.set('ownerToken', ownerToken());

  const items = await api(`/api/listings?${params}`);
  const grid = $('grid');
  $('empty').hidden = items.length > 0;
  grid.innerHTML = items.map(card).join('');
  bindCards();
}

async function init() {
  try {
    if (MINE) { $('pageTitle').textContent = '我的发布'; }
    const brands = await api('/api/brands');
    $('fBrand').innerHTML += brands.map((b) => `<option>${b}</option>`).join('');
    $('fCategory').innerHTML += CATEGORIES.map((c) => `<option>${c}</option>`).join('');
    $('applyFilter').addEventListener('click', loadList);
    await loadList();
  } catch (err) {
    alert(`加载失败：${err.message}`);
  }
}

init();
