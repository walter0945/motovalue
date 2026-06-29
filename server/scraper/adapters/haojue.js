/**
 * 豪爵铃木 官方价适配器。
 * 站点: haojue.com, 各车型有独立"配置与价格"页(如 /UHR150/jiage.html)。
 * 复用通用的"按 source 抓取"流程; 若站点结构变化, 仅需改本文件。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '豪爵 Haojue';
export const fetchPrices = (models) => fetchPricesBySource(models, 'haojue.com');
