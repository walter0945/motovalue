/**
 * 挂牌存储 —— CloudBase 云数据库 + 本地 JSON fallback。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCloudBase } from './cloudbase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'listings.json');

/* ── 本地 JSON fallback ── */
let cache = null;

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function loadLocal() {
  if (cache) return cache;
  cache = (await exists(FILE))
    ? JSON.parse(await readFile(FILE, 'utf-8'))
    : { listings: [] };
  return cache;
}

async function persistLocal() {
  await writeFile(FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

async function useCloud() {
  if (!process.env.TCB_ENV_ID) return null;
  return getCloudBase();
}

/* ── 公开 API ── */

export async function list(filter = {}) {
  const tcb = await useCloud();
  if (tcb) {
    let query = tcb.listingsCol;
    if (filter.brand) query = query.where({ brand: filter.brand });
    if (filter.category) query = query.where({ category: filter.category });
    if (filter.ownerToken) query = query.where({ ownerToken: filter.ownerToken });
    // CloudBase 价格过滤需客户端侧处理 (不支持 $lte 等复杂查询)
    const { data } = await query.orderBy('createdAt', 'desc').limit(200).get();
    let out = data || [];
    if (filter.maxPrice) out = out.filter((l) => l.askingPrice <= Number(filter.maxPrice));
    return out;
  }
  // fallback
  const db = await loadLocal();
  let out = [...db.listings];
  if (filter.brand) out = out.filter((l) => l.brand === filter.brand);
  if (filter.category) out = out.filter((l) => l.category === filter.category);
  if (filter.maxPrice) out = out.filter((l) => l.askingPrice <= Number(filter.maxPrice));
  if (filter.ownerToken) out = out.filter((l) => l.ownerToken === filter.ownerToken);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getById(id) {
  const tcb = await useCloud();
  if (tcb) {
    const { data } = await tcb.listingsCol.where({ id }).limit(1).get();
    return (data && data.length) ? data[0] : null;
  }
  return (await loadLocal()).listings.find((l) => l.id === id) ?? null;
}

export async function create(listing) {
  const tcb = await useCloud();
  const record = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: 'on_sale',
    ...listing,
  };
  if (tcb) {
    await tcb.listingsCol.add(record);
    return record;
  }
  const db = await loadLocal();
  db.listings = [record, ...db.listings];
  await persistLocal();
  return record;
}

export async function remove(id, ownerToken) {
  const tcb = await useCloud();
  if (tcb) {
    const { data } = await tcb.listingsCol.where({ id }).limit(1).get();
    if (!data || !data.length) return false;
    const doc = data[0];
    if (doc.ownerToken !== ownerToken) return false;
    await tcb.listingsCol.doc(doc._id).remove();
    return true;
  }
  const db = await loadLocal();
  const target = db.listings.find((l) => l.id === id);
  if (!target || target.ownerToken !== ownerToken) return false;
  db.listings = db.listings.filter((l) => l.id !== id);
  await persistLocal();
  return true;
}

export const COUNT = async () => {
  const tcb = await useCloud();
  if (tcb) {
    const { total } = await tcb.listingsCol.count();
    return total;
  }
  return (await loadLocal()).listings.length;
};
