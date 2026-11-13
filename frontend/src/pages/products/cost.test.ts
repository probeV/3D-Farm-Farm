import { describe, expect, it } from 'vitest'
import type { Color, Filament } from '../../api/filaments'
import type { CostSetting, PackSet, Part } from '../../api/products'
import {
  calcCost,
  completeMargin,
  costFormulas,
  partsByCategory,
  filamentUnitText,
  makeCatalog,
  marginClass,
  partUnitText,
  productColors,
  type CostInput,
} from './cost'

const counts = { sealed: 0, open: 0, empty: 0 }
const color = (
  id: number,
  filament: number,
  name: string,
  price: number | null,
  spool_price: number | null,
): Color => ({
  id,
  filament,
  name,
  hex: '#FFFFFF',
  price,
  spool_price,
  price_per_g: null,
  counts,
  last_buy: null,
})
const filament = (id: number, display_name: string, price: number | null, colors: Color[]): Filament => ({
  id,
  brand: 1,
  brand_name: '',
  material: 1,
  material_name: '',
  series: '',
  display_name,
  price,
  spool_g: 1000,
  avg_held_price: null,
  colors,
})
const part = (id: number, name: string, unit_price: number | null): Part => ({
  id,
  kind: 'part',
  name,
  category: null,
  shop: '',
  buy_url: '',
  price: unit_price,
  pack_qty: 1,
  unit: '개',
  unit_price,
  note: '',
  product_count: 0,
  photo: null,
  stock: 100,
  alert: 0,
  set_count: 0,
  last_used: null,
  last_buy: null,
})

// 화이트: 색상 가격 없음(필라멘트 가격 14,400) / 블랙: 색상 가격 15,000 / PETG: 가격 미입력
const WHITE = 11
const BLACK = 12
const CLEAR = 21
const filaments = [
  filament(1, 'Bambu Lab › PLA Basic', 14400, [
    color(WHITE, 1, '화이트', null, 14400),
    color(BLACK, 1, '블랙', 15000, 15000),
  ]),
  filament(2, 'Esun › PETG', null, [color(CLEAR, 2, '클리어', null, null)]),
]
const parts = [part(1, '네오디뮴 자석', 60), part(2, '에어캡', null)]
const setting: CostSetting = {
  power_kw: 0.36,
  elec_rate: 215,
  fee_order: 1.98,
  fee_sales: 2.73,
  shipping_cost: 0,
  target_margin: 40,
}
// 포장 세트 1: 포장재 없음(0원) — 기본 포장 경고 없이 다른 계산만 보려고. 2: 봉투 2장(100원)
const packParts = [{ ...part(9, '봉투', 50), kind: 'pack' as const }]
const packSets: PackSet[] = [
  { id: 1, name: '빈 세트', note: '', product_count: 0, lines: [] },
  { id: 2, name: '봉투 포장', note: '', product_count: 0, lines: [{ id: 1, part: 9, qty: 2 }] },
]
const catalog = makeCatalog(filaments, [...parts, ...packParts], setting, packSets)

const product = (p: Partial<CostInput> = {}): CostInput => ({
  print_minutes: 120,
  sale_price: 10000,
  default_pack: 1,
  filaments: [
    { filament: 1, color: WHITE, grams: 50 },
    { filament: 1, color: BLACK, grams: 20 },
  ],
  parts: [{ part: 1, qty: 2 }],
  ...p,
})

describe('원가 계산 (PRD 3.6)', () => {
  it('항목별 금액 · 원가 · 순이익 · 순마진율 · 권장 판매가', () => {
    const c = calcCost(product(), catalog)
    expect(c.grams).toBe(70)
    expect(c.filament).toBeCloseTo(50 * 14.4 + 20 * 15) // 1,020 (블랙은 색상 가격)
    expect(c.electricity).toBeCloseTo(2 * 0.36 * 215) // 154.8
    expect(c.parts).toBe(120)
    expect(c.cost).toBeCloseTo(1294.8)
    expect(c.feeRate).toBeCloseTo(0.0471)
    expect(c.fee).toBeCloseTo(471)
    expect(c.net).toBeCloseTo(10000 - 1294.8 - 471)
    expect(c.margin).toBeCloseTo(0.82342)
    // (1294.8 + 0) ÷ (1 − 0.0471 − 0.4) = 2341.8… → 100원 단위 올림
    expect(c.recommended).toBe(2400)
    expect(c.warnings).toEqual([])
  })

  it('색상을 안 고르거나 다른 필라멘트의 색상이면 필라멘트 가격', () => {
    for (const colorId of [null, CLEAR]) {
      const c = calcCost(product({ filaments: [{ filament: 1, color: colorId, grams: 10 }] }), catalog)
      expect(c.filament).toBeCloseTo(144)
    }
  })

  it('배송비는 순이익에서 뺀다', () => {
    const c = calcCost(product(), makeCatalog(filaments, parts, { ...setting, shipping_cost: 3000 }))
    expect(c.net).toBeCloseTo(10000 - c.cost - c.fee - 3000)
  })

  it('빠진 입력은 0원으로 계산하고 경고 (= 입력 필요)', () => {
    const c = calcCost(
      {
        print_minutes: null,
        sale_price: null,
        filaments: [{ filament: 2, color: CLEAR, grams: 30 }],
        parts: [{ part: 2, qty: 1 }],
        default_pack: null,
      },
      catalog,
    )
    expect(c.warnings).toEqual([
      'Esun › PETG 가격 미입력',
      '출력 시간 미입력',
      '에어캡 가격 미입력',
      '판매가 미입력',
      '기본 포장 미입력',
    ])
    expect(c.packWarnings).toEqual(['기본 포장 미입력'])
    expect(c.cost).toBe(0)
    expect(c.fee).toBe(0)
    expect(c.net).toBeNull()
    expect(c.margin).toBeNull()
    expect(completeMargin(c)).toBeNull()
  })

  it('사용량이 0 이면 경고, 같은 경고는 한 번', () => {
    const c = calcCost(
      product({
        filaments: [
          { filament: 2, color: null, grams: 0 },
          { filament: 2, color: CLEAR, grams: 0 },
        ],
      }),
      catalog,
    )
    expect(c.warnings).toEqual(['Esun › PETG 가격 미입력', '필라멘트 사용량 미입력'])
  })

  it('입력이 끝난 제품만 순마진율을 쓴다', () => {
    expect(completeMargin(calcCost(product(), catalog))).toBeCloseTo(0.82342)
    expect(completeMargin(calcCost(product({ print_minutes: 0 }), catalog))).toBeNull()
  })

  it('권장 판매가: 딱 떨어지면 그대로, 수수료 + 목표 마진이 100% 이상이면 없음', () => {
    const plain = {
      ...setting,
      power_kw: 0,
      fee_order: 0,
      fee_sales: 0,
      target_margin: 0,
    }
    const rec = (grams: number, s = plain) =>
      calcCost(
        product({ filaments: [{ filament: 1, color: WHITE, grams }], parts: [] }),
        makeCatalog(filaments, parts, s),
      ).recommended
    expect(rec(125)).toBe(1800) // 1,800원 그대로
    expect(rec(130)).toBe(1900) // 1,872원 → 1,900원
    expect(rec(130, { ...plain, target_margin: 100 })).toBeNull()
  })
})

describe('부자재비 카테고리별 (TBD-17)', () => {
  it('카테고리 이름순 · 미분류는 맨 뒤 · 가격 미입력은 0원', () => {
    const cat = makeCatalog(
      filaments,
      [{ ...part(1, '자석', 60), category: 2 }, { ...part(2, '박스', 400), category: 1 }, part(3, '스티커', null)],
      setting,
    )
    const p = product({
      parts: [
        { part: 1, qty: 12 },
        { part: 2, qty: 1 },
        { part: 3, qty: 1 },
      ],
    })
    const categories = [
      { id: 2, kind: 'part' as const, name: '부품', part_count: 1 },
      { id: 1, kind: 'part' as const, name: '포장재', part_count: 1 },
    ]
    expect(partsByCategory(p, cat, categories)).toEqual([
      { name: '부품', amount: 720 },
      { name: '포장재', amount: 400 },
      { name: '미분류', amount: 0 },
    ])
  })
})

describe('원가 내역 계산식 (TBD-19)', () => {
  it('그 제품 값으로 식을 채운다', () => {
    const p = product()
    const f = costFormulas(p, calcCost(p, catalog), setting)
    expect(f.electricity).toBe('2시간 × 0.36kW × 215원/kWh = 155원')
    expect(f.cost).toBe('필라멘트비 + 전기료 + 부속품비 + 포장비\n= 1,020원 + 155원 + 120원 + 0원')
    expect(f.fee).toBe('판매가 × (주문관리 1.98% + 판매 2.73%)\n= 10,000원 × 4.71%')
    expect(f.net).toBe('판매가 − 원가 − 수수료\n= 10,000원 − 1,295원 − 471원')
    expect(f.recommended).toContain('= (1,295원 + 0원) ÷ (1 − 4.71% − 40%)')
  })

  it('배송비가 있으면 순이익 식에 배송비', () => {
    const p = product()
    const s = { ...setting, shipping_cost: 3000 }
    const f = costFormulas(p, calcCost(p, makeCatalog(filaments, parts, s)), s)
    expect(f.net).toBe('판매가 − 원가 − 수수료 − 배송비\n= 10,000원 − 1,295원 − 471원 − 3,000원')
  })
})

describe('단가 안내 · 색상 · 순마진율 색', () => {
  it('단가 안내 (금액에 마우스를 올리면)', () => {
    expect(filamentUnitText(catalog, { filament: 1, color: BLACK, grams: 1 })).toBe(
      '색상 가격 15,000원 / 1000g · g당 15.0원',
    )
    expect(filamentUnitText(catalog, { filament: 1, color: null, grams: 1 })).toBe('14,400원 / 1000g · g당 14.4원')
    expect(filamentUnitText(catalog, { filament: 2, color: null, grams: 1 })).toBe(
      '필라멘트 가격 미입력 — 0원으로 계산',
    )
    expect(partUnitText(catalog, { part: 1, qty: 1 })).toBe('개당 60원')
    expect(partUnitText(catalog, { part: 2, qty: 1 })).toBe('가격 미입력 — 0원으로 계산')
  })

  it('제품 색상: 고른 색상만, 같은 색상은 한 번', () => {
    const p = product({
      filaments: [
        { filament: 1, color: WHITE, grams: 10 },
        { filament: 1, color: null, grams: 10 },
        { filament: 1, color: WHITE, grams: 10 },
        { filament: 1, color: BLACK, grams: 10 },
      ],
    })
    expect(productColors(p, catalog).map((c) => c.name)).toEqual(['화이트', '블랙'])
  })

  it('순마진율 색: 0% 미만 빨강 / 20% 미만 주황 / 그 외 초록', () => {
    expect(marginClass(-0.01)).toBe('m-bad')
    expect(marginClass(0.19)).toBe('m-warn')
    expect(marginClass(0.2)).toBe('m-good')
    expect(marginClass(null)).toBe('muted')
  })
})

describe('포장비 (v2 STOCK-06)', () => {
  it('기본 포장 세트 원가가 원가에 들어가고, 판매에 복사할 원가는 포장을 뺀다', () => {
    const without = calcCost(product(), catalog)
    const c = calcCost(product({ default_pack: 2 }), catalog)
    expect(c.pack).toBe(100)
    expect(c.cost).toBeCloseTo(without.cost + 100)
    expect(c.warnings).toEqual([])
  })
})
