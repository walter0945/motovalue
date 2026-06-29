/**
 * CloudBase 部署前构建: 将 server 代码复制到 cloudfunctions/api/ 。
 * 运行: node scripts/build-cf.js
 */
import { cp, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'server');
const DEST = join(ROOT, 'cloudfunctions', 'api', 'server');

// 需复制的文件
const FILES = [
  'index.js', 'valuation.js', 'db.js', 'listings.js', 'cloudbase.js', 'xianyu.js',
];

// 需复制的目录 (含子文件)
const DIRS = ['scraper'];

// 额外: 种子数据文件
const EXTRA = [
  ['data/models.seed.json', 'data/models.seed.json'],
];

try {
  await mkdir(DEST, { recursive: true });

  for (const f of FILES) {
    await cp(join(SRC, f), join(DEST, f), { force: true });
    console.log(`  ✓ ${f}`);
  }

  for (const d of DIRS) {
    await cp(join(SRC, d), join(DEST, d), { recursive: true, force: true });
    console.log(`  ✓ ${d}/`);
  }

  for (const [src, dst] of EXTRA) {
    await mkdir(dirname(join(DEST, dst)), { recursive: true }).catch(() => {});
    await cp(join(ROOT, src), join(DEST, dst), { force: true });
    console.log(`  ✓ ${src}`);
  }

  console.log(`\n[build-cf] 已构建 cloudfunctions/api/ (${FILES.length + DIRS.length + EXTRA.length} 项)`);
} catch (err) {
  console.error('[build-cf] 构建失败:', err.message);
  process.exit(1);
}
