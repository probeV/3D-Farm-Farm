import { describe, expect, it } from 'vitest'
import type { CostSetting } from '../../api/products'
import {
  CATEGORIES,
  categoryOf,
  examples,
  initialValues,
  ITEMS,
  pickCategory,
  readValues,
  settingSchema,
} from './schemas'

const saved: CostSetting = {
  power_kw: 0.36,
  elec_rate: 215,
  fee_order: 1.98,
  fee_sales: 2.73,
  shipping_cost: 0,
  target_margin: 40,
}
const cost = categoryOf('cost')
const store = categoryOf('store')

describe('설정 (PRD 3.8 · TBD-16)', () => {
  it('항목 기본값은 서버 기본값과 같고, 모든 항목이 분류 하나에만 있다', () => {
    expect(Object.fromEntries(ITEMS.map((it) => [it.key, it.def]))).toEqual(saved)
    expect(ITEMS).toHaveLength(Object.keys(saved).length)
    expect(CATEGORIES.map((c) => c.key)).toEqual(['cost', 'store'])
  })

  it('분류: 제품 원가 = 전기료 · 목표 마진율 / 스마트스토어 = 수수료 2개 · 배송비', () => {
    const keys = (c: typeof cost) => c.groups.flatMap((g) => g.items.map((it) => it.key))
    expect(keys(cost)).toEqual(['power_kw', 'elec_rate', 'target_margin'])
    expect(keys(store)).toEqual(['fee_order', 'fee_sales', 'shipping_cost'])
  })

  it('저장된 값 → 입력칸 글자 → 서버로 보낼 값 (천 단위 쉼표 허용)', () => {
    const values = { ...initialValues(saved), shipping_cost: '3,000' }
    expect(initialValues({ ...saved, shipping_cost: 3000 }).shipping_cost).toBe('3,000')
    expect(settingSchema.parse(values)).toEqual({ ...saved, shipping_cost: 3000 })
  })

  it('바뀐 항목 · 틀린 칸은 지금 분류 것만 (서버와 같은 범위)', () => {
    const values = {
      ...initialValues(saved),
      elec_rate: '230',
      power_kw: '0.1234',
      fee_sales: '120',
      shipping_cost: '',
    }
    const c = readValues(values, saved, cost)
    expect(c.errors).toEqual({ power_kw: '소수 3자리까지 입력하세요' })
    expect(c.changed).toEqual(['power_kw', 'elec_rate'])
    expect(c.numbers).toEqual({ ...saved, elec_rate: 230 }) // 틀린 칸 · 다른 분류는 저장된 값

    const s = readValues(values, saved, store)
    expect(s.errors).toEqual({ fee_sales: '100 이하로 입력하세요', shipping_cost: '입력하세요' })
    expect(s.changed).toEqual(['fee_sales', 'shipping_cost'])
  })

  it('저장은 분류의 항목만 보낸다', () => {
    expect(pickCategory({ ...saved, elec_rate: 230 }, cost)).toEqual({
      power_kw: 0.36,
      elec_rate: 230,
      target_margin: 40,
    })
    expect(Object.keys(pickCategory(saved, store))).toEqual(['fee_order', 'fee_sales', 'shipping_cost'])
  })

  it('계산 예시: 1시간 전기료 · 수수료 합계 · 2만원 판매 수수료 · 원가 1만원 권장 판매가', () => {
    const ex = examples(saved)
    expect(ex.hourElectricity).toBeCloseTo(77.4)
    expect(ex.feeRate).toBeCloseTo(0.0471)
    expect(ex.fee20k).toBeCloseTo(942)
    // 10000 ÷ (1 − 0.0471 − 0.4) = 18086.4… → 100원 단위 올림
    expect(ex.recommended10k).toBe(18100)
    expect(examples({ ...saved, target_margin: 96 }).recommended10k).toBeNull()
  })
})
