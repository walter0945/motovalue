/**
 * 种子脚本: 将 data/models.seed.json 并发导入 CloudBase 云数据库。
 * 用法: TCB_ENV_ID=xxx node scripts/seed-db.js
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, '..', 'data', 'models.seed.json');
const ENV_ID = process.env.TCB_ENV_ID;

if (!ENV_ID) {
  console.error('请设置 TCB_ENV_ID=你的环境ID');
  process.exit(1);
}

const cloudbase = (await import('@cloudbase/node-sdk')).default;
const initOpts = { env: ENV_ID };
if (process.env.TCB_SECRET_ID) initOpts.secretId = process.env.TCB_SECRET_ID;
if (process.env.TCB_SECRET_KEY) initOpts.secretKey = process.env.TCB_SECRET_KEY;
const app = cloudbase.init(initOpts);
const db = app.database();
const col = db.collection('moto_models');

const { models } = JSON.parse(await readFile(SEED, 'utf-8'));
console.log(`种子: ${models.length} 款车型, 50 并发写入...`);

const CONCURRENCY = 50;
let done = 0, errors = 0;
const start = Date.now();

for (let i = 0; i < models.length; i += CONCURRENCY) {
  const batch = models.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(
    batch.map((m) =>
      col.add({
        id: m.id, brand: m.brand || '?', name: m.name || m.id,
        category: m.category || '街车', displacement: m.displacement || 0,
        price: m.price || 0, tier: m.tier || 'DOMESTIC_TOP',
        emission: m.emission || '国四', source: m.source || '',
        ref: m.ref || m.source || '',
        priceVerified: m.priceVerified ?? true,
        updatedAt: m.updatedAt || new Date().toISOString().slice(0, 10),
      }).then(() => 'ok').catch((e) => { errors++; return e.message; })
    )
  );
  done += batch.length;
  const pct = Math.round((done / models.length) * 100);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`  ${done}/${models.length} (${pct}%) — ${elapsed}s`);
}

console.log(`\n✅ 完成: ${done} 条, 错误 ${errors}, 耗时 ${((Date.now()-start)/1000).toFixed(0)}s`);
