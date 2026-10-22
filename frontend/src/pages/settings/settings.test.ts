import { describe, expect, it } from 'vitest'
import type { CostSetting } from '../../api/products'
import { examples, initialValues, ITEMS, readValues, settingSchema } from './schemas'

const saved: CostSetting = {
  power_kw: 0.36,
  elec_rate: 215,
  fee_order: 1.98,
  fee_sales: 2.73,
  shipping_cost: 0,
  target_margin: 40,
}

describe('제품 원가 설정 (PRD 3.8)', () => {
  it('항목 기본값은 서버 기본값과 같다', () => {
    expect(Object.fromEntries(ITEMS.map((it) => [it.key, it.def]))).toEqual(saved)
  })

  it('저장된 값 → 입력칸 글자 → 서버로 보낼 값 (천 단위 쉼표 허용)', () => {
    const values = { ...initialValues(saved), shipping_cost: '3,000' }
    expect(initialValues({ ...saved, shipping_cost: 3000 }).shipping_cost).toBe('3,000')
    expect(settingSchema.parse(values)).toEqual({ ...saved, shipping_cost: 3000 })
  })

  it('바뀐 항목 · 기본값과 다른 항목 · 틀린 칸 (서버와 같은 범위)', () => {
    const r = readValues(
      { ...initialValues(saved), elec_rate: '230', fee_sales: '120', power_kw: '0.1234', shipping_cost: '' },
      saved,
    )
    expect(r.errors).toEqual({
      fee_sales: '100 이하로 입력하세요',
      power_kw: '소수 3자리까지 입력하세요',
      shipping_cost: '입력하세요',
    })
    expect(r.changed).toEqual(['power_kw', 'elec_rate', 'fee_sales', 'shipping_cost'])
    expect(r.offDefault).toBe(1) // elec_rate 만 (틀린 칸은 세지 않음)
    expect(r.numbers).toEqual({ ...saved, elec_rate: 230 }) // 틀린 칸은 저장된 값
  })

  it('계산 예시: 1시간 전기료 · 수수료 합계 · 원가 1만원 권장 판매가', () => {
    const ex = examples(saved)
    expect(ex.hourElectricity).toBeCloseTo(77.4)
    expect(ex.feeRate).toBeCloseTo(0.0471)
    // 10000 ÷ (1 − 0.0471 − 0.4) = 18086.4… → 100원 단위 올림
    expect(ex.recommended10k).toBe(18100)
    expect(examples({ ...saved, target_margin: 96 }).recommended10k).toBeNull()
  })
})
