import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import type { Expense, ExpenseLine } from '../../api/expenses'
import {
  buyField,
  buyMark,
  checkRows,
  emptyRow,
  isLatest,
  linesErrorMessage,
  parseRows,
  splitTotals,
  toInput,
  type BuyRow,
} from './buyRows'

const row = (p: Partial<BuyRow>): BuyRow => ({ ...emptyRow(), ...p })

const line = (p: Partial<ExpenseLine>): ExpenseLine => ({
  id: 1,
  color: null,
  part: null,
  qty: 1,
  amount: null,
  total: 0,
  each: 0,
  name: '',
  unit: '개',
  spools: 0,
  ...p,
})

const expense = (p: Partial<Expense>): Expense => ({
  id: 1,
  date: '2026-10-01',
  name: '구매',
  category: 'part',
  amount: 1000,
  shop: '',
  note: '',
  recurring: null,
  lines: [],
  ...p,
})

describe('buyField', () => {
  it('필라멘트는 색상, 부속품 · 포장재 · 소모품은 품목, 나머지는 없음', () => {
    expect(['filament', 'part', 'pack', 'supply', 'invest', 'sub', ''].map((c) => buyField(c as never))).toEqual([
      'color',
      'part',
      'part',
      'part',
      null,
      null,
      null,
    ])
  })
})

describe('splitTotals', () => {
  it('비운 줄은 남은 금액을 필라멘트는 통 수대로 나눔', () => {
    const rows = parseRows([row({ pick: 1, qty: '4' }), row({ pick: 2, qty: '2' })])
    expect(splitTotals('filament', 108000, rows)).toEqual([72000, 36000])
  })

  it('금액 적은 줄은 그대로, 남은 금액은 비운 줄에 (고르지 않은 줄은 뺌)', () => {
    const rows = parseRows([row({ pick: 1, qty: '2', amount: '30,000' }), row({ pick: 2, qty: '1' }), row({})])
    expect(splitTotals('part', 50000, rows)).toEqual([30000, 20000])
  })
})

describe('checkRows', () => {
  it('규칙 (서버와 같음)', () => {
    const cases: [string, BuyRow[], string | null][] = [
      ['part', [row({ pick: 1, qty: '200' })], null],
      ['part', [row({ pick: 1, qty: '0' })], '수량을 확인하세요'],
      ['filament', [row({ pick: 1, qty: '1.5' })], '통 수는 정수로 적어요'],
      ['part', [row({ pick: 1, amount: '-1' })], '줄 금액을 확인하세요'],
      ['filament', [row({ id: 3, pick: 1, qty: '1', spools: 2 })], '스풀 2통을 이미 등록했어요'],
      ['part', [row({ pick: 1, amount: '1' }), row({ pick: 1, amount: '1' })], '같은 것이 두 줄 있어요'],
      ['part', [row({ pick: 1 }), row({ pick: 2 })], '여러 가지면 줄마다 금액'],
      ['filament', [row({ pick: 1 }), row({ pick: 2 })], null],
      ['part', [row({ pick: 1, amount: '2000' })], '줄 금액 합계가 지출 금액보다 커요'],
      ['supply', [row({})], null],
    ]
    for (const [category, rows, want] of cases) expect(checkRows(category as never, 1000, rows)).toBe(want)
  })
})

describe('toInput', () => {
  it('고른 줄만, 기존 줄은 id 와 함께', () => {
    expect(toInput('color', [row({ id: 7, pick: 1, qty: '4' }), row({})])).toEqual([
      { id: 7, color: 1, part: null, qty: 4, amount: null },
    ])
    expect(toInput('part', [row({ pick: 2, qty: '1.5', amount: '900' })])).toEqual([
      { color: null, part: 2, qty: 1.5, amount: 900 },
    ])
  })
})

describe('isLatest', () => {
  const june = expense({ id: 1, date: '2026-06-03', lines: [line({ part: 5 })] })
  const oct = expense({ id: 2, date: '2026-10-03', lines: [line({ part: 5 })] })
  const all = [oct, june]

  it('더 늦은 지출에 같은 품목이 있으면 최근 구매 아님', () => {
    expect(isLatest(all, june, 'part', 5, june.date)).toBe(false)
    expect(isLatest(all, oct, 'part', 5, oct.date)).toBe(true)
    expect(isLatest(all, june, 'part', 6, june.date)).toBe(true)
  })

  it('같은 날이면 나중에 넣은 지출이 최근 (새 지출은 가장 나중)', () => {
    expect(isLatest(all, null, 'part', 5, '2026-10-03')).toBe(true)
    expect(
      isLatest([...all, expense({ id: 3, date: '2026-10-03', lines: [line({ part: 5 })] })], oct, 'part', 5, oct.date),
    ).toBe(false)
  })
})

describe('buyMark', () => {
  it('필라멘트는 통 수 · 등록 수, 품목은 첫 단어 + 수량', () => {
    const fil = expense({
      category: 'filament',
      lines: [line({ qty: 4, spools: 3, name: '화이트' }), line({ qty: 2, name: '블랙' })],
    })
    expect(buyMark(fil)?.text).toBe('🧵 6통 · 등록 3')
    const part = expense({
      lines: [line({ qty: 200, name: '네오디뮴 자석 6×3mm' }), line({ qty: 50, name: '소형 박스' })],
    })
    expect(buyMark(part)?.text).toBe('📦 네오디뮴 200개 · 소형 50개')
    expect(buyMark(expense({}))).toBeNull()
  })
})

describe('linesErrorMessage', () => {
  it('목록 전체 오류 · 줄마다 오류 → 한 줄', () => {
    expect(linesErrorMessage(new ApiError(400, { lines: ['여러 가지면 줄마다 금액을 적으세요.'] }))).toBe(
      '여러 가지면 줄마다 금액을 적으세요.',
    )
    expect(linesErrorMessage(new ApiError(400, { lines: [{}, { qty: ['스풀 2통을 이미 등록했습니다.'] }] }))).toBe(
      '구매 2번째 줄: 스풀 2통을 이미 등록했습니다.',
    )
    expect(linesErrorMessage(new ApiError(400, { name: ['x'] }))).toBeNull()
  })
})
