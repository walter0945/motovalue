/**
 * CloudBase 共享连接 (懒加载, 单例)。
 * 环境变量 TCB_ENV_ID 为空时静默跳过 (本地开发模式)。
 */
let cloudbase = null;
let db = null;
let modelsCol = null;
let listingsCol = null;
let ready = null; // Promise 防并发重复初始化

export async function getCloudBase() {
  if (!process.env.TCB_ENV_ID) return null;
  if (ready) return ready;
  if (db) return { db, modelsCol, listingsCol };

  ready = (async () => {
    try {
      cloudbase = (await import('@cloudbase/node-sdk')).default;
      const app = cloudbase.init({ env: process.env.TCB_ENV_ID });
      db = app.database();
      modelsCol = db.collection('moto_models');
      listingsCol = db.collection('moto_listings');
      console.info('[cloudbase] 已连接云数据库');
    } catch (err) {
      console.warn(`[cloudbase] 初始化失败, 回退本地 JSON: ${err.message}`);
      db = null;
    }
    return db ? { db, modelsCol, listingsCol } : null;
  })();

  return ready;
}
