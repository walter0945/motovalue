/**
 * 春风 CFMoto 官方价适配器。
 * 站点: cfmoto.com, 各车型有独立参数/报价页(如 /400CC/18751.html)。
 * 实测该站为服务端渲染, 价格在静态 HTML 中可提取。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '春风 CFMoto';
export const fetchPrices = (models) => fetchPricesBySource(models, 'cfmoto.com');
