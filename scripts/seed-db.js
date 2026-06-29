/**
 * 种子脚本: 将 data/models.seed.json 导入 CloudBase 云数据库。
 *
 * 用法:
 *   TCB_ENV_ID=your-env-id node scripts/seed-db.js
 *
 * 前提: 已在 CloudBase 控制台创建 moto_models 集合。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, '..', 'data', 'models.seed.json');

const ENV_ID = process.env.TCB_ENV_ID;
if (!ENV_ID) {
  console.error('请设置 TCB_ENV_ID 环境变量');
  console.error('用法: TCB_ENV_ID=your-env-id node scripts/seed-db.js');
  process.exit(1);
}

// 动态加载 CloudBase SDK (不在 package.json 的 dependencies 中, 需手动 npm i)
let cloudbase;
try {
  cloudbase = (await import('@cloudbase/node-sdk')).default;
} catch {
  console.error('请先安装: npm i @cloudbase/node-sdk');
  process.exit(1);
}

const app = cloudbase.init({ env: ENV_ID });
const db = app.database();
const col = db.collection('moto_models');

// 读取种子数据
const raw = await readFile(SEED, 'utf-8');
const { models } = JSON.parse(raw);
console.log(`种子文件: ${models.length} 款车型`);

// 分批写入 (CloudBase 单次批量添加有限制，每次 50 条)
const BATCH = 50;
let inserted = 0;

for (let i = 0; i < models.length; i += BATCH) {
  const batch = models.slice(i, i + BATCH);
  const ops = batch.map((m) => col.add({
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
    priceVerified: m.priceVerified ?? true,
    updatedAt: m.updatedAt || new Date().toISOString().slice(0, 10),
  }));

  // CloudBase 不支持批量 add，逐个写入
  for (const op of ops) {
    try {
      await op;
      inserted++;
    } catch (err) {
      console.error(`  写入失败 ${op.id}: ${err.message}`);
    }
  }

  const pct = Math.round((Math.min(i + BATCH, models.length) / models.length) * 100);
  console.log(`  进度: ${Math.min(i + BATCH, models.length)}/${models.length} (${pct}%)`);
}

console.log(`\n导入完成: ${inserted}/${models.length} 条`);
console.log('提示: 如有重复 id，CloudBase 会创建多条记录。如需去重请先在控制台清空集合。');
