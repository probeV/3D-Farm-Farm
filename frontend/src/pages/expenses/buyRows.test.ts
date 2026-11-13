import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import type { Expense, ExpenseItem } from '../../api/expenses'
import {
  averageEach,
  buyField,
  buyMark,
  checkRows,
  emptyRow,
  isLatest,
  itemsErrorMessage,
  minRolls,
  parseRows,
  spoolDiff,
  splitTotals,
  toInput,
  type BuyRow,
} from './buyRows'

const row = (p: Partial<BuyRow>): BuyRow => ({ ...emptyRow(), ...p })

const item = (p: Partial<ExpenseItem>): ExpenseItem => ({
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
  used: 0,
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
  items: [],
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

describe('splitTotals · averageEach', () => {
  it('비운 항목은 남은 금액을 필라멘트는 롤 수대로 나눔', () => {
    const rows = parseRows([row({ pick: 1, qty: '4' }), row({ pick: 2, qty: '2' })])
    expect(splitTotals('filament', 108000, rows)).toEqual([72000, 36000])
  })

  it('금액 적은 항목은 그대로, 남은 금액은 비운 항목에 (고르지 않은 항목은 뺌)', () => {
    const rows = parseRows([row({ pick: 1, qty: '2', amount: '30,000' }), row({ pick: 2, qty: '1' }), row({})])
    expect(splitTotals('part', 50000, rows)).toEqual([30000, 20000])
  })

  it('같은 색상 여러 항목이면 단가는 합계 ÷ 롤 수 합계', () => {
    const rows = parseRows([row({ pick: 1, qty: '9', amount: '180000' }), row({ pick: 1, qty: '1', amount: '10000' })])
    expect(averageEach(rows, splitTotals('filament', 190000, rows)).get(1)).toBe(19000)
  })
})

describe('스풀 차이 (지출 → 스풀, 차이만)', () => {
  it('새 항목은 롤 수만큼, 고치면 저장된 롤 수와의 차이', () => {
    expect(spoolDiff(row({ qty: '4' }))).toBe(4)
    expect(spoolDiff(row({ id: 3, qty: '6', was: 4 }))).toBe(2)
    expect(spoolDiff(row({ id: 3, qty: '2', was: 4 }))).toBe(-2)
  })

  it('줄일 수 있는 최소 롤 수 = 저장된 롤 수 − 재고 스풀 수', () => {
    // 4롤 중 1개 사용, 1개는 스풀에서 지움 → 재고 스풀 2개 → 2롤까지
    expect(minRolls(row({ id: 3, was: 4, spools: 3, used: 1 }))).toBe(2)
  })
})

describe('checkRows', () => {
  it('규칙 (서버와 같음)', () => {
    const cases: [string, BuyRow[], string | null][] = [
      ['part', [row({ pick: 1, qty: '200' })], null],
      ['part', [row({ pick: 1, qty: '0' })], '수량을 확인하세요'],
      ['filament', [row({ pick: 1, qty: '1.5' })], '롤 수는 정수로 적어요'],
      ['part', [row({ pick: 1, amount: '-1' })], '항목 금액을 확인하세요'],
      [
        'filament',
        [row({ id: 3, pick: 1, qty: '1', was: 4, spools: 4, used: 2 })],
        '재고 스풀이 2개라 2롤보다 적게 줄일 수 없어요',
      ],
      ['part', [row({ pick: 1, amount: '1' }), row({ pick: 1, amount: '1' })], null], // 같은 품목 여러 항목 가능
      ['part', [row({ pick: 1 }), row({ pick: 2 })], '여러 가지면 항목마다 금액'],
      ['filament', [row({ pick: 1 }), row({ pick: 2 })], null],
      ['part', [row({ pick: 1, amount: '2000' })], '항목 금액 합계가 지출 금액보다 커요'],
      ['supply', [row({})], null],
    ]
    for (const [category, rows, want] of cases) expect(checkRows(category as never, 1000, rows)).toBe(want)
  })
})

describe('toInput', () => {
  it('고른 항목만, 기존 항목은 id 와 함께', () => {
    expect(toInput('color', [row({ id: 7, pick: 1, qty: '4' }), row({})])).toEqual([
      { id: 7, color: 1, part: null, qty: 4, amount: null },
    ])
    expect(toInput('part', [row({ pick: 2, qty: '1.5', amount: '900' })])).toEqual([
      { color: null, part: 2, qty: 1.5, amount: 900 },
    ])
  })
})

describe('isLatest', () => {
  const june = expense({ id: 1, date: '2026-06-03', items: [item({ part: 5 })] })
  const oct = expense({ id: 2, date: '2026-10-03', items: [item({ part: 5 })] })
  const all = [oct, june]

  it('더 늦은 지출에 같은 품목이 있으면 최근 구매 아님', () => {
    expect(isLatest(all, june, 'part', 5, june.date)).toBe(false)
    expect(isLatest(all, oct, 'part', 5, oct.date)).toBe(true)
    expect(isLatest(all, june, 'part', 6, june.date)).toBe(true)
  })

  it('같은 날이면 나중에 넣은 지출이 최근 (새 지출은 가장 나중)', () => {
    expect(isLatest(all, null, 'part', 5, '2026-10-03')).toBe(true)
    const later = expense({ id: 3, date: '2026-10-03', items: [item({ part: 5 })] })
    expect(isLatest([...all, later], oct, 'part', 5, oct.date)).toBe(false)
  })
})

describe('buyMark', () => {
  it('필라멘트는 롤 수, 품목은 첫 단어 + 수량', () => {
    const fil = expense({
      category: 'filament',
      items: [item({ qty: 4, used: 1, name: '화이트' }), item({ qty: 2, name: '블랙' })],
    })
    expect(buyMark(fil)).toEqual({ text: '🧵 6롤', title: '스풀 6개 (사용 1) · 화이트 4롤, 블랙 2롤' })
    const part = expense({
      items: [item({ qty: 200, name: '네오디뮴 자석 6×3mm' }), item({ qty: 50, name: '소형 박스' })],
    })
    expect(buyMark(part)?.text).toBe('📦 네오디뮴 200개 · 소형 50개')
    expect(buyMark(expense({}))).toBeNull()
  })
})

describe('itemsErrorMessage', () => {
  it('목록 전체 오류 · 항목마다 오류 → 한 줄', () => {
    expect(itemsErrorMessage(new ApiError(400, { items: ['여러 가지면 항목마다 금액을 적으세요.'] }))).toBe(
      '여러 가지면 항목마다 금액을 적으세요.',
    )
    expect(
      itemsErrorMessage(
        new ApiError(400, { items: [{}, { color: ['사용한 스풀 2개가 있어 색상을 바꿀 수 없습니다.'] }] }),
      ),
    ).toBe('구매 2번째 항목: 사용한 스풀 2개가 있어 색상을 바꿀 수 없습니다.')
    expect(itemsErrorMessage(new ApiError(400, { name: ['x'] }))).toBeNull()
  })
})
