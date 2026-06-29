/**
 * 详情页: 展示车源信息、卖家定价 vs 科学估价明细、联系方式、收藏与下架。
 */
'use strict';

const ID = new URLSearchParams(location.search).get('id');

/** 卖家定价相对估价的结论文案。 */
function priceVerdict(asking, fair) {
  const diff = Math.round(((asking - fair) / fair) * 100);
  if (diff <= -3) return `<span class="badge good">比科学估价低 ${-diff}%，相对实惠</span>`;
  if (diff >= 12) return `<span class="badge high">比科学估价高 ${diff}%，可议价</span>`;
  return `<span class="badge good">与科学估价基本持平</span>`;
}

function render(l) {
  const v = l.valuation;
  const mine = l.ownerToken === ownerToken();
  const fav = isFavorite(l.id);
  const rows = v.breakdown.map((b) => {
    const hint = b.hint ? `<span class="hint" style="color:var(--muted);font-size:11px"> ${b.hint}</span>` : '';
    return `<tr><td>${b.key}${hint}</td><td>${b.value}</td></tr>`;
  }).join('');
  const warn = (v.warnings || []).map((w) => `<div>${w}</div>`).join('');

  $('detail').innerHTML = `
    <div class="detail-head">
      <div>
        <h1 class="page-title" style="margin-bottom:4px">${l.title}</h1>
        <div class="lc-meta" style="color:var(--muted);font-size:13px">${l.brand} ${l.modelName} · ${l.category} · ${l.displacement}cc</div>
      </div>
      <button class="fav-btn ${fav ? 'on' : ''}" id="favBtn" style="position:static;font-size:26px">${fav ? '♥' : '♡'}</button>
    </div>

    <div style="margin:14px 0">
      <div class="detail-price">${fmt(l.askingPrice)}</div>
      <div style="margin-top:6px">${priceVerdict(l.askingPrice, v.price.fair)}　<span style="color:var(--muted);font-size:13px">科学估价 ${fmt(v.price.fair)}（${fmt(v.price.quickSale)} ~ ${fmt(v.price.listing)}）</span></div>
    </div>

    <div class="kv">
      <div><span>使用年限</span>${l.ageYears} 年</div>
      <div><span>行驶里程</span>${l.mileageKm.toLocaleString()} km</div>
      <div><span>排放标准</span>${l.emission}</div>
      <div><span>所在城市</span>${l.city || '未填'}</div>
    </div>
    ${l.description ? `<p style="color:var(--text);font-size:14px">${l.description}</p>` : ''}

    ${warn ? `<div class="warnings">${warn}</div>` : ''}

    <h3 style="color:var(--muted);font-size:14px;margin:18px 0 8px">科学估价构成（可解释）</h3>
    <table class="breakdown"><tbody>${rows}</tbody></table>

    <div class="contact-box"><b>联系卖家：</b>${l.contact}　<span style="color:var(--muted);font-size:12px">· 请当面验车、核实手续后交易</span></div>

    ${mine ? `<div style="margin-top:16px"><button class="btn-ghost btn-danger" id="delBtn">下架我的车源</button></div>` : ''}
  `;

  $('favBtn').addEventListener('click', () => {
    const on = toggleFavorite(l.id);
    $('favBtn').classList.toggle('on', on);
    $('favBtn').textContent = on ? '♥' : '♡';
  });
  if (mine) $('delBtn').addEventListener('click', () => onDelete(l.id));
}

async function onDelete(id) {
  if (!confirm('确定下架这条车源？')) return;
  try {
    await api(`/api/listings/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken: ownerToken() }),
    });
    location.href = '/market.html?mine=1';
  } catch (err) {
    alert(`下架失败：${err.message}`);
  }
}

async function init() {
  if (!ID) {
    $('detail').innerHTML = '<div class="empty">缺少车源 id</div>';
    return;
  }
  try {
    render(await api(`/api/listings/${ID}`));
  } catch (err) {
    $('detail').innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

init();
