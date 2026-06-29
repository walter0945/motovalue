/**
 * 将运行时数据(models.json)同步回种子文件(models.seed.json)。
 * GitHub Actions 抓取完成后调用, 使 Render 部署时能拿到最新数据。
 */
import { copyFile } from 'node:fs/promises';
import { PATHS } from '../db.js';

try {
  await copyFile(PATHS.RUNTIME_PATH, PATHS.SEED_PATH);
  console.log(`[sync-seed] ${PATHS.RUNTIME_PATH} → ${PATHS.SEED_PATH} (${new Date().toISOString()})`);
} catch (err) {
  console.error('[sync-seed] 同步失败:', err.message);
  process.exit(1);
}
