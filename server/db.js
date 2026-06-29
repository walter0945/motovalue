/**
 * 数据存储 —— CloudBase 云数据库 + 本地 JSON fallback。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getCloudBase } from './cloudbase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SEED_PATH = join(DATA_DIR, 'models.seed.json');
const RUNTIME_PATH = join(DATA_DIR, 'models.json');

/* ── 本地 JSON fallback ── */
let cache = null;

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function loadLocal() {
  if (cache) return cache;
  const path = (await exists(RUNTIME_PATH)) ? RUNTIME_PATH : SEED_PATH;
  cache = JSON.parse(await readFile(path, 'utf-8'));
  if (path === SEED_PATH) await persistLocal();
  return cache;
}

async function persistLocal() {
  await writeFile(RUNTIME_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

async function useCloud() {
  if (!process.env.TCB_ENV_ID) return null;
  return getCloudBase();
}

/* ── 公开 API ── */

export async function getModels() {
  const tcb = await useCloud();
  if (tcb) {
    const all = [];
    let offset = 0;
    const LIMIT = 200;
    while (true) {
      const { data } = await tcb.modelsCol.skip(offset).limit(LIMIT).get();
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < LIMIT) break;
      offset += LIMIT;
    }
    return all;
  }
  return (await loadLocal()).models;
}

export async function getBrands() {
  const models = await getModels();
  return [...new Set(models.map((m) => m.brand))];
}

export async function getModelById(id) {
  const tcb = await useCloud();
  if (tcb) {
    const { data } = await tcb.modelsCol.where({ id }).limit(1).get();
    return (data && data.length) ? data[0] : null;
  }
  return (await getModels()).find((m) => m.id === id) ?? null;
}

export async function updatePrice(id, price, source) {
  const tcb = await useCloud();
  if (tcb) {
    const { data } = await tcb.modelsCol.where({ id }).limit(1).get();
    if (!data || !data.length) return false;
    const model = data[0];
    if (model.price === price) return false;
    await tcb.modelsCol.doc(model._id).update({
      price, source: source ?? model.source,
      priceVerified: true,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    return true;
  }
  // fallback
  const db = await loadLocal();
  const model = db.models.find((m) => m.id === id);
  if (!model) return false;
  const changed = model.price !== price;
  if (changed) {
    const next = { ...model, price, source: source ?? model.source, priceVerified: true, updatedAt: new Date().toISOString().slice(0, 10) };
    db.models = db.models.map((m) => (m.id === id ? next : m));
    await persistLocal();
  }
  return changed;
}

export async function upsertModels(incoming) {
  if (!incoming || incoming.length === 0) return { added: 0, updated: 0 };
  const tcb = await useCloud();

  if (tcb) {
    let added = 0, updated = 0;
    const today = new Date().toISOString().slice(0, 10);
    const ops = incoming.map(async (m) => {
      const { data } = await tcb.modelsCol.where({ id: m.id }).limit(1).get();
      if (data && data.length) {
        const e = data[0];
        if (e.price !== m.price || !e.priceVerified) {
          await tcb.modelsCol.doc(e._id).update({
            price: m.price ?? e.price, source: m.source ?? e.source,
            ref: m.ref ?? e.ref, priceVerified: true, updatedAt: today,
          });
          return { added: 0, updated: 1 };
        }
        return { added: 0, updated: 0 };
      }
      await tcb.modelsCol.add({
        id: m.id, brand: m.brand || '未知', name: m.name || m.id,
        category: m.category || '街车', displacement: m.displacement || 0,
        price: m.price || 0, tier: m.tier || 'DOMESTIC_TOP',
        emission: m.emission || '国四', source: m.source || '',
        ref: m.ref || m.source || '', priceVerified: true, updatedAt: today,
      });
      return { added: 1, updated: 0 };
    });
    const results = await Promise.all(ops);
    added = results.reduce((s, r) => s + r.added, 0);
    updated = results.reduce((s, r) => s + r.updated, 0);
    return { added, updated };
  }

  // fallback
  const db = await loadLocal();
  const byId = new Map(db.models.map((m) => [m.id, m]));
  let added = 0, updated = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (existing) {
      if (existing.price !== m.price || !existing.priceVerified) {
        Object.assign(existing, { price: m.price ?? existing.price, source: m.source ?? existing.source, ref: m.ref ?? existing.ref, priceVerified: true, updatedAt: today });
        updated++;
      }
    } else {
      db.models.push({
        id: m.id, brand: m.brand || '未知', name: m.name || m.id,
        category: m.category || '街车', displacement: m.displacement || 0,
        price: m.price || 0, tier: m.tier || 'DOMESTIC_TOP',
        emission: m.emission || '国四', source: m.source || '',
        ref: m.ref || m.source || '', priceVerified: true, updatedAt: today,
      });
      added++;
    }
  }
  await persistLocal();
  return { added, updated };
}

export async function reload() {
  if (process.env.TCB_ENV_ID) return getModels();
  cache = null;
  return loadLocal();
}

export const PATHS = { SEED_PATH, RUNTIME_PATH };
