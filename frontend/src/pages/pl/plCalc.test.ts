import { describe, expect, it } from 'vitest'
import type { ExpenseCategory } from '../../api/expenses'
import type { PlMonth } from '../../api/pl'
import { calc, chartCols, isEmptyMonth, manText, monthsIn, recovery, signedWon } from './plCalc'

const NO_EXP: Record<ExpenseCategory, number> = {
  invest: 0,
  filament: 0,
  part: 0,
  pack: 0,
  supply: 0,
  sub: 0,
  sell: 0,
  tax: 0,
  etc: 0,
}

const month = (
  m: string,
  patch: Partial<Omit<PlMonth, 'expenses'>> = {},
  exp: Partial<typeof NO_EXP> = {},
): PlMonth => ({
  month: m,
  gross: 0,
  shipping: 0,
  fee: 0,
  sales: 0,
  spool: 0,
  spools: 0,
  spools_unpriced: 0,
  parts_used: 0,
  parts_unpriced: 0,
  ...patch,
  expenses: { ...NO_EXP, ...exp },
})

// 예: 1월 프린터 120만, 매달 매출 50만 · 재료비 + 운영비 30만
const MONTHS = [
  month('2026-01', { gross: 500000, spool: 100000, spools: 5 }, { invest: 1200000, filament: 200000, sub: 200000 }),
  month('2026-02', { gross: 500000, spool: 100000, spools: 5 }, { sub: 200000 }),
  month('2026-03'),
  month('2027-01', { gross: 500000, shipping: 6000, fee: 23831, sales: 3, spool: 18000, spools: 1 }, { tax: 50000 }),
]

describe('손익 계산', () => {
  it('손익 기준: 장비 · 필라멘트 지출은 빼고 뜯은 스풀로', () => {
    const r = calc(MONTHS.slice(0, 1))
    expect(r.revenue).toBe(500000)
    expect(r.material).toBe(100000)
    expect(r.opsSum).toBe(200000)
    expect(r.net).toBe(200000)
  })

  it('손익 기준: 부속품 · 포장재는 산 돈이 아니라 쓴 만큼', () => {
    const r = calc([
      month('2026-04', { gross: 100000, parts_used: 3000, parts_unpriced: 1 }, { part: 12000, pack: 8900 }),
    ])
    expect(r.material).toBe(3000)
    expect(r.partBuy).toBe(20900)
    expect(r.partUnpriced).toBe(1)
    expect(r.net).toBe(97000)
    expect(r.cash).toBe(100000 - 20900)
  })

  it('현금 기준: 지출 전부 (장비 · 필라멘트 포함)', () => {
    const r = calc(MONTHS.slice(0, 1))
    expect(r.outAll).toBe(1600000)
    expect(r.cash).toBe(500000 - 1600000)
  })

  it('수수료는 운영비, 받은 배송비는 매출, 세금은 영업이익 다음', () => {
    const r = calc(MONTHS.slice(3))
    expect(r.revenue).toBe(506000)
    expect(r.settle).toBe(506000 - 23831)
    expect(r.ops.fee).toBe(23831)
    expect(r.operating).toBe(506000 - 18000 - 23831)
    expect(r.net).toBe(r.operating - 50000)
  })

  it('투자 회수 = 처음부터 순이익 ÷ 장비 지출', () => {
    expect(recovery(calc(MONTHS.slice(0, 2)))).toBeCloseTo(400000 / 1200000)
    expect(recovery(calc(MONTHS.slice(3)))).toBeNull()
  })

  it('기간에 드는 달', () => {
    expect(monthsIn(MONTHS, { kind: 'month', m: '2026-02' }).map((m) => m.month)).toEqual(['2026-02'])
    expect(monthsIn(MONTHS, { kind: 'year', y: '2026' })).toHaveLength(3)
    expect(monthsIn(MONTHS, { kind: 'all' })).toHaveLength(4)
  })

  it('기록 없는 달', () => {
    expect(isEmptyMonth(MONTHS[2])).toBe(true)
    expect(isEmptyMonth(MONTHS[1])).toBe(false)
  })

  it('월별 그래프: 누적 잔액은 현금 기준을 처음부터 더함', () => {
    const pl = chartCols(MONTHS.slice(0, 2), 'pl')
    expect(pl.map((c) => [c.a, c.b, c.v])).toEqual([
      [500000, 300000, 200000],
      [500000, 300000, 200000],
    ])
    const cash = chartCols(MONTHS.slice(0, 2), 'cash')
    expect(cash.map((c) => c.acc)).toEqual([-1100000, -800000])
  })

  it('숫자 모양', () => {
    expect(manText(127700)).toBe('13만')
    expect(manText(-31500)).toBe('−3만')
    expect(manText(4000)).toBe('0')
    expect(signedWon(-1100000)).toBe('−1,100,000원')
  })
})
