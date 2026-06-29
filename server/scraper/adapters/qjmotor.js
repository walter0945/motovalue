/**
 * 钱江 QJMotor 官方价适配器。
 * 站点: qjmotor.com。建议为各车型在种子库中补全独立产品页 source 以提升命中率。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '钱江 QJMotor';
export const fetchPrices = (models) => fetchPricesBySource(models, 'qjmotor.com');
