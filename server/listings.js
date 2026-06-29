/**
 * 二手车发布(挂牌)存储 —— 基于 JSON 文件。
 *
 * 设计:
 *   - 每条挂牌内含一份"估价快照"(发布时由估价引擎生成), 用于在详情页对比卖家定价。
 *   - ownerToken 为客户端生成的轻量身份(无密码 MVP), 用于管理/删除自己的发布。
 *   - 纯函数式更新: 列表用 map/filter 生成新数组, 不就地修改。
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'listings.json');

let cache = null;

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function load() {
  if (cache) return cache;
  try {
    cache = (await exists(FILE)) ? JSON.parse(await readFile(FILE, 'utf-8')) : { listings: [] };
    return cache;
  } catch (err) {
    throw new Error(`加载挂牌数据失败: ${err.message}`);
  }
}

async function persist() {
  try {
    await writeFile(FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`写入挂牌数据失败: ${err.message}`);
  }
}

/** 列表(可按品牌/类别/价格过滤), 默认按发布时间倒序。 */
export async function list(filter = {}) {
  const db = await load();
  let out = [...db.listings];
  if (filter.brand) out = out.filter((l) => l.brand === filter.brand);
  if (filter.category) out = out.filter((l) => l.category === filter.category);
  if (filter.maxPrice) out = out.filter((l) => l.askingPrice <= Number(filter.maxPrice));
  if (filter.ownerToken) out = out.filter((l) => l.ownerToken === filter.ownerToken);
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getById(id) {
  const db = await load();
  return db.listings.find((l) => l.id === id) ?? null;
}

/** 新建挂牌, 返回创建后的对象(含 id)。 */
export async function create(listing) {
  const db = await load();
  const record = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: 'on_sale',
    ...listing,
  };
  db.listings = [record, ...db.listings];
  await persist();
  return record;
}

/** 删除挂牌(需 ownerToken 匹配)。返回是否删除成功。 */
export async function remove(id, ownerToken) {
  const db = await load();
  const target = db.listings.find((l) => l.id === id);
  if (!target || target.ownerToken !== ownerToken) return false;
  db.listings = db.listings.filter((l) => l.id !== id);
  await persist();
  return true;
}

export const COUNT = async () => (await load()).listings.length;
