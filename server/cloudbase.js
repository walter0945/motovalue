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
      const initOpts = { env: process.env.TCB_ENV_ID };
      // 本地环境需显式传密钥 (云函数内自动注入)
      if (process.env.TCB_SECRET_ID) initOpts.secretId = process.env.TCB_SECRET_ID;
      if (process.env.TCB_SECRET_KEY) initOpts.secretKey = process.env.TCB_SECRET_KEY;
      const app = cloudbase.init(initOpts);
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
