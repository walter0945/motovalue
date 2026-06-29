/**
 * 本田 Honda 官方价适配器。
 * 本田在华为两家合资公司, 分属不同站点:
 *   - 五羊本田: honda-motorcycles.com.cn
 *   - 新大洲本田: honda-sundiro.com
 * 故对两个域名分别抓取后合并。
 */
import { fetchPricesBySource } from './base.js';

export const brand = '本田 Honda';

export async function fetchPrices(models) {
  const wuyang = await fetchPricesBySource(models, 'honda-motorcycles.com.cn');
  const sundiro = await fetchPricesBySource(models, 'honda-sundiro.com');
  return [...wuyang, ...sundiro];
}
