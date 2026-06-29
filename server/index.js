/**
 * 应用入口 —— Express 服务器。
 * 提供估价 API + 车型数据 API, 并托管前端静态页面。
 */
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getModels, getBrands, getModelById, reload } from './db.js';
import { estimate, OPTIONS } from './valuation.js';
import { startScheduler } from './scraper/scheduler.js';
import { runScrape } from './scraper/index.js';
import * as listings from './listings.js';
import { getXianyuRange } from './xianyu.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// CloudBase 共享初始化 (有 TCB_ENV_ID 时自动连接云数据库)
import './cloudbase.js';

const app = express();
const PORT = process.env.PORT || 9000;  // CloudBase HTTP 云函数默认 9000

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// 统一的异步错误包装, 避免未捕获 reject。
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[API] 错误:', err.message);
  res.status(500).json({ error: err.message });
});

// 品牌列表
app.get('/api/brands', wrap(async (req, res) => {
  res.json(await getBrands());
}));

// 车型列表(可按品牌过滤)
app.get('/api/models', wrap(async (req, res) => {
  const models = await getModels();
  const { brand } = req.query;
  res.json(brand ? models.filter((m) => m.brand === brand) : models);
}));

// 估价表单可选项(前后端口径一致)
app.get('/api/options', (req, res) => res.json(OPTIONS));

// 估价
app.post('/api/valuation', wrap(async (req, res) => {
  const { modelId } = req.body || {};
  const model = await getModelById(modelId);
  if (!model) {
    res.status(400).json({ error: '未找到该车型, 请重新选择' });
    return;
  }
  const result = estimate(model, req.body);
  // 附带价格来源与更新时间, 让用户知道基准价从哪来
  result.priceSource = { url: model.source, updatedAt: model.updatedAt, verified: model.priceVerified };
  res.json(result);
}));

// 手动估价: 自定义车型(不在数据库中) — 前端传完整 model 对象
app.post('/api/valuation/custom', wrap(async (req, res) => {
  const { model, input } = req.body || {};
  if (!model || typeof model.price !== 'number' || model.price <= 0) {
    res.status(400).json({ error: '请提供有效的新车指导价' });
    return;
  }
  if (!model.brand) model.brand = '自定义车型';
  if (!model.category) model.category = '街车';
  if (!model.tier) model.tier = 'DOMESTIC_TOP';
  const result = estimate(model, input || {});
  res.json(result);
}));

// —— 闲鱼比价 ——
app.get('/api/xianyu/:modelId', wrap(async (req, res) => {
  const model = await getModelById(req.params.modelId);
  if (!model) { res.status(404).json({ error: '车型不存在' }); return; }
  const range = await getXianyuRange(model, req.query);
  res.json({ model: { brand: model.brand, name: model.name, newPrice: model.price }, ...range });
}));

// —— 抓取/刷新 ——
// POST /api/scrape?discover=1  → 后台启动全量发现, 立即返回
// GET  /api/scrape/status       → 查询当前抓取进度/结果

let scrapeJob = null; // { running: true, discover, startedAt, progress: { msg, pct }, result: null, error: null }

app.post('/api/scrape', (req, res) => {
  const discover = req.query.discover === '1' || req.query.discover === 'true';
  const maxBrands = parseInt(req.query.maxBrands) || 0;

  if (scrapeJob && scrapeJob.running) {
    res.json({ status: 'busy', message: '已有抓取任务正在运行', progress: scrapeJob.progress });
    return;
  }

  scrapeJob = {
    running: true,
    discover,
    startedAt: new Date().toISOString(),
    progress: { msg: '启动中...', pct: 0 },
    result: null,
    error: null,
  };

  console.info(`[API] 后台启动抓取 ${discover ? '(含全量发现)' : '(仅增量刷新)'}`);

  // 后台异步执行
  const logs = [];
  const captureLog = {
    info: (msg) => { console.info(msg); logs.push(msg); scrapeJob.progress = { msg, pct: scrapeJob.progress.pct }; },
    warn: (msg) => { console.warn(msg); logs.push(msg); },
    error: (msg) => { console.error(msg); logs.push(msg); },
  };

  runScrape({ log: captureLog, discover, maxBrands, skipIncremental: discover })
    .then(async (stats) => {
      await reload(); // 强制刷新缓存, 确保网页端立即可见
      scrapeJob.running = false;
      scrapeJob.result = {
        discovered: stats.discovered,
        updated: stats.updated,
        unchanged: stats.unchanged,
        missed: stats.missed,
        total: stats.total,
        durationMs: stats.durationMs,
        sources: stats.sources,
      };
      scrapeJob.progress = { msg: '完成', pct: 100 };
      scrapeJob.logs = logs.slice(-50);
      console.info(`[API] 后台抓取完成: ${JSON.stringify(scrapeJob.result)}`);
    })
    .catch((err) => {
      scrapeJob.running = false;
      scrapeJob.error = err.message;
      scrapeJob.logs = logs.slice(-50);
      console.error(`[API] 后台抓取失败: ${err.message}`);
    });

  res.json({ status: 'started', discover, message: '抓取已在后台启动' });
});

// 强制刷新缓存(抓取完成后调用)
app.post('/api/reload', wrap(async (req, res) => {
  await reload();
  const models = await getModels();
  res.json({ ok: true, total: models.length });
}));

app.get('/api/scrape/status', (req, res) => {
  if (!scrapeJob) {
    res.json({ status: 'idle' });
    return;
  }
  if (scrapeJob.running) {
    res.json({
      status: 'running',
      discover: scrapeJob.discover,
      startedAt: scrapeJob.startedAt,
      progress: scrapeJob.progress,
    });
  } else if (scrapeJob.error) {
    res.json({
      status: 'error',
      error: scrapeJob.error,
      logs: scrapeJob.logs || [],
    });
    scrapeJob = null; // 重置, 允许下次请求
  } else {
    res.json({
      status: 'completed',
      discover: scrapeJob.discover,
      stats: scrapeJob.result,
      logs: scrapeJob.logs || [],
    });
    scrapeJob = null; // 重置, 允许下次请求
  }
});

// —— 交易: 挂牌列表(可筛选) ——
app.get('/api/listings', wrap(async (req, res) => {
  res.json(await listings.list(req.query));
}));

// 挂牌详情
app.get('/api/listings/:id', wrap(async (req, res) => {
  const item = await listings.getById(req.params.id);
  if (!item) {
    res.status(404).json({ error: '该车源不存在或已下架' });
    return;
  }
  res.json(item);
}));

// 发布挂牌: 服务端复用估价引擎生成估价快照, 与卖家定价一并存储
app.post('/api/listings', wrap(async (req, res) => {
  const b = req.body || {};
  const model = await getModelById(b.modelId);
  if (!model) {
    res.status(400).json({ error: '未找到该车型, 请重新选择' });
    return;
  }
  if (!b.ownerToken || !b.contact) {
    res.status(400).json({ error: '缺少必填项(联系方式)' });
    return;
  }
  const valuation = estimate(model, b);
  const askingPrice = Number(b.askingPrice) || valuation.price.fair;
  const record = await listings.create({
    ownerToken: b.ownerToken,
    title: b.title || `${model.brand} ${model.name}`,
    modelId: model.id, brand: model.brand, modelName: model.name,
    category: model.category, displacement: model.displacement,
    ageYears: Number(b.ageYears) || 0, mileageKm: Number(b.mileageKm) || 0,
    emission: b.emission, city: b.city || '', region: b.region,
    askingPrice, valuation, contact: b.contact, description: b.description || '',
  });
  res.status(201).json(record);
}));

// 下架(需 ownerToken)
app.delete('/api/listings/:id', wrap(async (req, res) => {
  const ok = await listings.remove(req.params.id, (req.body || {}).ownerToken);
  res.status(ok ? 200 : 403).json({ ok });
}));

app.listen(PORT, () => {
  console.info(`二手摩托估价服务已启动: http://localhost:${PORT}`);

  // 抓取调度: 仅在本地开发环境 + ENABLE_SCRAPER=1 时开启
  // CloudBase 上不启动 (无 Chrome/Puppeteer 环境)
  if (process.env.ENABLE_SCRAPER === '1' && !process.env.TCB_ENV_ID) {
    const scheduler = startScheduler({
      runOnStart: process.env.SCRAPE_ON_START === '1',
      discover: process.env.SCRAPE_DISCOVER === '1',
    });
    console.info(`[抓取] 定时刷新已启用 (全量发现: ${process.env.SCRAPE_DISCOVER === '1' ? '开' : '关'})`);
  }
});

// CloudBase HTTP 云函数入口
export const main = app;
