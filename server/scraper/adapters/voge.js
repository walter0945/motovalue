/**
 * 无极 Voge(隆鑫) 官方价适配器。
 * 站点: voge.com.cn。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '无极 Voge';
export const fetchPrices = (models) => fetchPricesBySource(models, 'voge.com.cn');
