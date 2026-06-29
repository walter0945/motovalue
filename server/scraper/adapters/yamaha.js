/**
 * 雅马哈 Yamaha 官方价适配器。
 * 站点: yamaha-motor.com.cn。建议为各车型补全独立产品页 source。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '雅马哈 Yamaha';
export const fetchPrices = (models) => fetchPricesBySource(models, 'yamaha-motor.com.cn');
