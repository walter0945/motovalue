/**
 * 跨页面共享工具: 请求封装、格式化、轻量身份(ownerToken)、收藏(localStorage)。
 */
'use strict';

const $ = (id) => document.getElementById(id);
const fmt = (n) => `¥${Number(n).toLocaleString('zh-CN')}`;

/** 自动检测 CloudBase 环境, 设置 API 基地址 */
const API_BASE = (() => {
  const host = location.hostname;
  // CloudBase 静态托管: https://{env-id}.tcloudbaseapp.com
  // 对应云函数: https://{env-id}.service.tcloudbase.com/api
  if (host.includes('tcloudbaseapp.com')) {
    const envId = host.split('.')[0];
    return `https://${envId}.service.tcloudbase.com/api`;
  }
  // 本地开发: 相对路径
  return '';
})();

/** 通用 JSON 请求, 统一错误处理。 */
async function api(path, options) {
  const url = API_BASE + path;
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `请求失败 (${res.status})`);
  }
  return res.json();
}

/** 客户端身份令牌(无密码 MVP): 首次访问生成并存 localStorage。 */
function ownerToken() {
  let t = localStorage.getItem('moto_owner');
  if (!t) {
    t = 'u_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('moto_owner', t);
  }
  return t;
}

// —— 收藏 ——
const favKey = 'moto_favorites';
const getFavorites = () => JSON.parse(localStorage.getItem(favKey) || '[]');
function toggleFavorite(id) {
  const set = new Set(getFavorites());
  set.has(id) ? set.delete(id) : set.add(id);
  localStorage.setItem(favKey, JSON.stringify([...set]));
  return set.has(id);
}
const isFavorite = (id) => getFavorites().includes(id);

/** 高亮当前导航项(同时区分 ?mine 视图)。 */
function markNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const mineNow = new URLSearchParams(location.search).get('mine') === '1';
  document.querySelectorAll('.nav a').forEach((a) => {
    const url = new URL(a.getAttribute('href'), location.origin);
    const samePage = url.pathname.endsWith(here);
    const sameMine = (url.searchParams.get('mine') === '1') === mineNow;
    if (samePage && sameMine) a.classList.add('active');
  });
}
document.addEventListener('DOMContentLoaded', markNav);

/* ── 移动端汉堡菜单 ── */
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const nav = document.querySelector('.nav');
  if (!hamburger || !nav) return;
  hamburger.addEventListener('click', () => {
    nav.classList.toggle('open');
    hamburger.textContent = nav.classList.contains('open') ? '✕' : '☰';
  });
  // 点击导航链接后自动收起
  nav.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      hamburger.textContent = '☰';
    });
  });
});
