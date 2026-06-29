/**
 * 二手摩托车估价引擎 v2 —— 符合中国大陆国情的量化模型
 *
 * 估价 = 新车指导价
 *      × 综合残值( 年限基础残值 ⊗ 类别折旧 ⊗ 品牌保值 )    // 贬值缺口叠加, 见下
 *      × 里程修正(按车型类别校准年均里程)
 *      × 车况系数(外观·机械·事故·改装·保养)
 *      × 过户记录(一手/过户次数)
 *      × 排放系数(国四/国三/国二)
 *      × 手续系数(三证/发票/登记证/抵押)
 *      × 区域系数(禁摩/限摩/不禁摩)
 *
 * 残值叠加法: 残值 = 1 - (1 - 年限基础残值) × 类别折旧 × 品牌折旧
 *   - 新车(基础残值=1)时缺口为0, 残值=1, 不受类别/品牌影响 -> 符合"新车都接近指导价"
 *   - 年限越久缺口越大, 类别/品牌差异随之放大 -> 符合"老车才看出保值差异"
 *
 * 所有系数集中此处, 估价结果附逐项明细, 可量化、可解释。纯函数, 不改入参。
 */

// —— 强制报废年限(中国大陆摩托车强制报废为13年) ——
const SCRAP_YEARS = 13;

// 年限基础残值率表(整数年 -> 保留比例)。已内含临近报废的快速贬值。
const AGE_RETENTION = Object.freeze({
  0: 1.0, 1: 0.78, 2: 0.66, 3: 0.57, 4: 0.49, 5: 0.42, 6: 0.36,
  7: 0.3, 8: 0.25, 9: 0.2, 10: 0.15, 11: 0.1, 12: 0.05, 13: 0.02,
});

// 类别折旧系数(作用于贬值缺口; <1=更保值, >1=贬值更快)。
const CATEGORY_DECAY = Object.freeze({
  踏板: 1.12, 弯梁: 1.15, 街车: 1.0, 跑车: 1.03,
  复古: 0.9, 拉力: 0.93, 巡航: 0.97, 越野: 1.1,
});

// 品牌折旧系数(作用于贬值缺口; <1=保值, >1=掉价)。按真实二手保值梯度。
const BRAND_DECAY = Object.freeze({
  '本田 Honda': 0.85, '雅马哈 Yamaha': 0.88, '川崎 Kawasaki': 0.9,
  '哈雷 Harley': 0.88, '宝马 BMW': 0.93, '豪爵 Haojue': 0.95,
  KTM: 1.0, '春风 CFMoto': 1.0, '光阳 KYMCO': 0.98, '三阳 SYM': 0.98,
  '贝纳利 Benelli': 1.06, '钱江 QJMotor': 1.06, '无极 Voge': 1.06, '凯越 Kayo': 1.08,
});
// 品牌未在上表时, 按保值档位兜底。
const TIER_DECAY = Object.freeze({
  IMPORT_PREMIUM: 0.9, JOINT_VENTURE: 0.95, DOMESTIC_TOP: 1.0, DOMESTIC_MID: 1.06,
});

// 各类别年均里程假设(km), 用于里程偏离修正。
const CATEGORY_ANNUAL_KM = Object.freeze({
  踏板: 10000, 弯梁: 11000, 街车: 8000, 跑车: 6000,
  复古: 7000, 拉力: 9000, 巡航: 8000, 越野: 5000,
});

const APPEARANCE_FACTOR = Object.freeze({
  '95新': 1.0, '9成新': 0.97, '8成新': 0.93, '7成新': 0.87, '6成新及以下': 0.78,
});
const MECHANICAL_FACTOR = Object.freeze({ 优秀: 1.0, 良好: 0.95, 一般: 0.88, 有故障: 0.78 });
const ACCIDENT_FACTOR = Object.freeze({
  无事故: 1.0, 轻微剐蹭: 0.95, 中等事故: 0.85, '重大/泡水/火烧': 0.6,
});
const MODIFICATION_FACTOR = Object.freeze({ 原厂状态: 1.0, 轻度改装: 0.98, 重度改装: 0.92 });
const MAINTENANCE_FACTOR = Object.freeze({ 记录完整: 1.03, 部分记录: 1.0, 无记录: 0.97 });
const TRANSFER_FACTOR = Object.freeze({
  '一手(未过户)': 1.03, 过户1次: 1.0, 过户2次: 0.96, '过户3次及以上': 0.9,
});
const EMISSION_FACTOR = Object.freeze({ 国五: 1.0, 国四: 1.0, 国三: 0.85, 国二及以下: 0.7 });
const DOCS_FACTOR = Object.freeze({
  三证齐全: 1.0, 缺购车发票: 0.96, '缺登记证书(大绿本)': 0.82, 有抵押未解押: 0.78,
});
const REGION_FACTOR = Object.freeze({ 不禁摩: 1.0, 限摩限行: 0.95, 完全禁摩: 0.88 });

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** 线性插值年限基础残值率, 支持小数年龄。 */
function ageRetention(ageYears) {
  if (ageYears >= SCRAP_YEARS) return AGE_RETENTION[13];
  const lo = Math.floor(ageYears);
  const hi = Math.min(lo + 1, SCRAP_YEARS);
  return AGE_RETENTION[lo] + (AGE_RETENTION[hi] - AGE_RETENTION[lo]) * (ageYears - lo);
}

/** 综合残值: 年限基础残值经类别、品牌折旧调整(贬值缺口叠加)。 */
function combinedResidual(base, category, brand, tier) {
  const cat = CATEGORY_DECAY[category] ?? 1;
  const brd = BRAND_DECAY[brand] ?? TIER_DECAY[tier] ?? 1;
  const residual = 1 - (1 - base) * cat * brd;
  return { residual: clamp(residual, AGE_RETENTION[13], 0.98), cat, brd };
}

/** 里程相对类别"应有里程"的偏离修正。 */
function mileageFactor(ageYears, km, category) {
  const annual = CATEGORY_ANNUAL_KM[category] ?? 8000;
  const expected = Math.max(ageYears * annual, 3000);
  const ratio = km / expected;
  if (ratio <= 0.4) return 1.06;
  if (ratio <= 0.7) return 1.03;
  if (ratio <= 1.3) return 1.0;
  if (ratio <= 1.9) return 0.95;
  if (ratio <= 2.6) return 0.89;
  return 0.83;
}

/** 五项车况子系数相乘, 合理区间约束。 */
function conditionFactor(c) {
  const raw =
    (APPEARANCE_FACTOR[c.appearance] ?? 1) *
    (MECHANICAL_FACTOR[c.mechanical] ?? 1) *
    (ACCIDENT_FACTOR[c.accident] ?? 1) *
    (MODIFICATION_FACTOR[c.modification] ?? 1) *
    (MAINTENANCE_FACTOR[c.maintenance] ?? 1);
  return clamp(raw, 0.4, 1.05);
}

const round100 = (n) => Math.round(n / 100) * 100;
const pct = (n) => `${Math.round((n - 1) * 1000) / 10}%`;

/** 生成人类可读的风险/政策提示。 */
function buildWarnings(input, age) {
  const out = [];
  if (age >= SCRAP_YEARS) out.push('⚠️ 该车已达或超过13年强制报废年限,基本只剩残值,无法正常过户上路。');
  else if (age >= 11) out.push(`⚠️ 距13年强制报废仅剩 ${(SCRAP_YEARS - age).toFixed(1)} 年,残值快速衰减,买家议价空间大。`);
  if (input.emission === '国三') out.push('⚠️ 国三排放在多数地区已无法新上牌/迁入,仅能本地过户,显著影响转手。');
  if (input.emission === '国二及以下') out.push('⚠️ 国二及以下排放极难过户,流通性很差。');
  if (input.docs === '缺登记证书(大绿本)') out.push('⚠️ 缺登记证书(大绿本)无法办理过户,属重大手续缺陷。');
  if (input.docs === '有抵押未解押') out.push('⚠️ 车辆有抵押未解押,过户前需先解押,买家风险高。');
  if (input.transfer === '过户3次及以上') out.push('ℹ️ 过户次数较多,买家会担心车况与来源,定价偏保守。');
  if (input.region === '完全禁摩') out.push('ℹ️ 所在地禁摩,本地需求受限,建议考虑跨区域出售。');
  return out;
}

/**
 * 估价主函数。
 * @param {{price:number, tier:string, category:string, brand:string}} model 车型
 * @param {object} input 用户填写的车况与信息
 * @returns {object} 含点估价、价格区间、逐项明细、提示
 */
export function estimate(model, input) {
  if (!model || typeof model.price !== 'number') {
    throw new Error('缺少有效的车型新车指导价');
  }
  const age = Math.max(0, Number(input.ageYears) || 0);
  const km = Math.max(0, Number(input.mileageKm) || 0);
  const category = model.category;

  const base = ageRetention(age);
  const { residual, cat, brd } = combinedResidual(base, category, model.brand, model.tier);
  const retentionAdj = base > 0 ? residual / base : 1; // 类别·品牌对残值的净影响
  const fMile = mileageFactor(age, km, category);
  const fCond = conditionFactor(input);
  const fTransfer = TRANSFER_FACTOR[input.transfer] ?? 1;
  const fEmis = EMISSION_FACTOR[input.emission] ?? 1;
  const fDocs = DOCS_FACTOR[input.docs] ?? 1;
  const fRegion = REGION_FACTOR[input.region] ?? 1;

  const point = model.price * residual * fMile * fCond * fTransfer * fEmis * fDocs * fRegion;

  const decayHint = `类别${category} ×${cat} · 品牌 ×${brd}`;
  const breakdown = [
    { key: '新车指导价', value: `¥${round100(model.price).toLocaleString()}`, factor: null },
    { key: `年限基础残值(${age}年)`, value: pct(base + 0), factor: base, hint: '13年强制报废曲线插值' },
    { key: '类别·品牌保值调整', value: pct(retentionAdj), factor: retentionAdj, hint: decayHint },
    { key: '里程修正', value: pct(fMile), factor: fMile, hint: `按${category}年均${CATEGORY_ANNUAL_KM[category] ?? 8000}km评估` },
    { key: '车况综合', value: pct(fCond), factor: fCond, hint: '外观·机械·事故·改装·保养' },
    { key: '过户记录', value: pct(fTransfer), factor: fTransfer },
    { key: '排放标准', value: pct(fEmis), factor: fEmis },
    { key: '手续完整', value: pct(fDocs), factor: fDocs },
    { key: '区域政策', value: pct(fRegion), factor: fRegion },
  ];

  return {
    model: { brand: model.brand, name: model.name, newPrice: model.price, category },
    price: {
      listing: round100(point * 1.08),
      fair: round100(point),
      quickSale: round100(point * 0.9),
    },
    breakdown,
    warnings: buildWarnings(input, age),
    disclaimer: '估价为基于车况与政策的模型测算,仅供参考;实际成交受具体车况、地区行情与议价影响。',
  };
}

// 暴露可选项给前端构建表单, 保证前后端口径一致。
export const OPTIONS = Object.freeze({
  appearance: Object.keys(APPEARANCE_FACTOR),
  mechanical: Object.keys(MECHANICAL_FACTOR),
  accident: Object.keys(ACCIDENT_FACTOR),
  modification: Object.keys(MODIFICATION_FACTOR),
  maintenance: Object.keys(MAINTENANCE_FACTOR),
  transfer: Object.keys(TRANSFER_FACTOR),
  emission: ['国五', '国四', '国三', '国二及以下'],
  docs: Object.keys(DOCS_FACTOR),
  region: Object.keys(REGION_FACTOR),
});
