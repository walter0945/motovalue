/**
 * 轻量数据存储 —— 基于 JSON 文件。
 *
 * 运行时数据(data/models.json)在首次启动时从种子(data/models.seed.json)初始化。
 * 抓取任务通过 updatePrice() 刷新价格, 不直接改种子, 保证可回溯。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SEED_PATH = join(DATA_DIR, 'models.seed.json');
const RUNTIME_PATH = join(DATA_DIR, 'models.json');

let cache = null;

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 读取运行时数据;若不存在则用种子初始化。 */
export async function load() {
  if (cache) return cache;
  try {
    const path = (await exists(RUNTIME_PATH)) ? RUNTIME_PATH : SEED_PATH;
    const raw = await readFile(path, 'utf-8');
    cache = JSON.parse(raw);
    if (path === SEED_PATH) await persist(); // 落地一份可写副本
    return cache;
  } catch (err) {
    throw new Error(`加载车型数据失败: ${err.message}`);
  }
}

async function persist() {
  try {
    await writeFile(RUNTIME_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`写入车型数据失败: ${err.message}`);
  }
}

export async function getModels() {
  const db = await load();
  return db.models;
}

export async function getBrands() {
  const models = await getModels();
  return [...new Set(models.map((m) => m.brand))];
}

export async function getModelById(id) {
  const models = await getModels();
  return models.find((m) => m.id === id) ?? null;
}

/**
 * 抓取任务回写价格。返回是否有变更。
 * @param {string} id 车型 id
 * @param {number} price 最新指导价
 * @param {string} source 来源 URL
 */
export async function updatePrice(id, price, source) {
  const db = await load();
  const model = db.models.find((m) => m.id === id);
  if (!model) return false;
  const changed = model.price !== price;
  // 不可变更新: 生成新对象替换, 避免就地修改
  const next = { ...model, price, source: source ?? model.source, priceVerified: true, updatedAt: new Date().toISOString().slice(0, 10) };
  db.models = db.models.map((m) => (m.id === id ? next : m));
  await persist();
  return changed;
}

/**
 * 批量写入/更新车型(抓取发现的新车型 + 已有车型价格刷新)。
 * 按 id 去重: 已存在则更新 price/source/priceVerified, 不存在则追加。
 * @param {Array} incoming 抓取到的车型数组, 每个至少含 { id, brand, name, price, source }
 * @returns {{ added: number, updated: number }} 统计
 */
export async function upsertModels(incoming) {
  if (!incoming || incoming.length === 0) return { added: 0, updated: 0 };
  const db = await load();
  const byId = new Map(db.models.map((m) => [m.id, m]));
  let added = 0;
  let updated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (existing) {
      const changed = existing.price !== m.price || existing.priceVerified !== true;
      Object.assign(existing, {
        price: m.price ?? existing.price,
        source: m.source ?? existing.source,
        ref: m.ref ?? existing.ref,
        priceVerified: true,
        updatedAt: today,
      });
      if (changed) updated++;
    } else {
      // 新车型: 补全必填字段默认值
      const entry = {
        id: m.id,
        brand: m.brand || '未知',
        name: m.name || m.id,
        category: m.category || '街车',
        displacement: m.displacement || 0,
        price: m.price || 0,
        tier: m.tier || 'DOMESTIC_TOP',
        emission: m.emission || '国四',
        source: m.source || '',
        ref: m.ref || m.source || '',
        priceVerified: true,
        updatedAt: today,
      };
      db.models.push(entry);
      byId.set(m.id, entry);
      added++;
    }
  }

  await persist();
  return { added, updated };
}

/** 强制重新从文件加载(抓取完成后调用, 确保缓存与文件一致)。 */
export async function reload() {
  cache = null;
  return load();
}

export const PATHS = { SEED_PATH, RUNTIME_PATH };
