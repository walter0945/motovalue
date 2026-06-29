/**
 * 定时抓取调度 —— 基于 node-cron。
 * 默认每天凌晨 04:00 跑一轮; 启动时也可选立即跑一次。
 */
import cron from 'node-cron';
import { runScrape } from './index.js';

const DEFAULT_CRON = '0 4 * * *'; // 每天 04:00

/**
 * 启动定时任务。
 * @param {object} opts
 * @param {string} [opts.schedule] cron 表达式
 * @param {boolean} [opts.runOnStart] 启动后是否立即跑一次
 * @param {boolean} [opts.discover] 是否含全量发现(默认 false, 仅增量刷新)
 */
export function startScheduler({ schedule = DEFAULT_CRON, runOnStart = false, discover = false } = {}) {
  if (runOnStart) {
    console.info(`[抓取] 启动首跑 ${discover ? '(含全量发现)' : '(仅增量刷新)'} ...`);
    runScrape({ discover }).catch((err) => console.error('[抓取] 启动首跑失败:', err.message));
  }

  const task = cron.schedule(schedule, () => {
    runScrape({ discover }).catch((err) => console.error('[抓取] 定时执行失败:', err.message));
  });

  console.info(`[抓取] 定时任务已启动 (cron: ${schedule}${discover ? ', 含全量发现' : ''})`);
  return task;
}
