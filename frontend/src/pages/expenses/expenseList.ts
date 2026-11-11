// 지출 목록의 기간 · 검색 · 정렬 · 요약 · 분류별 합계 · 넣을 반복 지출 · CSV (EXP-01 · 04 ~ 07, docs/screens.md 5장)
// 날짜는 "2026-10-21" 글자 그대로 비교한다 (같은 모양이라 글자 순서 = 날짜 순서)
import type { Expense, ExpenseCategory, RecurringExpense } from '../../api/expenses'
import { toCsv } from '../../csv'
import { compareBy, type SortColumns, type SortState } from '../../sort'
import { CATEGORIES, categoryInfo } from './categories'

const monthOf = (date: string) => date.slice(0, 7)
const sum = (rows: { amount: number }[]) => rows.reduce((a, x) => a + x.amount, 0)

// ---------------------------------------------------------------- 기간 · 검색 · 정렬

export type Period = 'month' | 'year' | 'all' | 'custom'

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: '이번 달' },
  { key: 'year', label: '올해' },
  { key: 'all', label: '전체' },
  { key: 'custom', label: '직접 지정' },
]

// 열 제목 정렬 (TBD-05). 같은 값이면 최근 날짜 → 나중에 넣은 것 먼저
const newestFirst = (a: Expense, b: Expense) => b.date.localeCompare(a.date) || b.id - a.id

export const SORT_COLUMNS = {
  date: { value: (x) => x.date, first: 'desc' },
  name: { value: (x) => x.name },
  category: { value: (x) => CATEGORIES.findIndex((c) => c.key === x.category) },
  shop: { value: (x) => x.shop || null },
  amount: { value: (x) => x.amount, first: 'desc' },
} satisfies SortColumns<Expense, string>

export type Sort = SortState<keyof typeof SORT_COLUMNS>

export interface ListFilter {
  q: string
  category: ExpenseCategory | ''
  period: Period
  from: string // 직접 지정: 비우면 처음부터
  to: string // 직접 지정: 비우면 오늘까지
  sort: Sort
}

export const NO_FILTER: ListFilter = {
  q: '',
  category: '',
  period: 'all',
  from: '',
  to: '',
  sort: { key: 'date', dir: 'desc' },
}

export function inPeriod(date: string, f: Pick<ListFilter, 'period' | 'from' | 'to'>, today: string) {
  switch (f.period) {
    case 'month':
      return monthOf(date) === monthOf(today)
    case 'year':
      return date.slice(0, 4) === today.slice(0, 4)
    case 'custom':
      return (!f.from || date >= f.from) && (!f.to || date <= f.to)
    default:
      return true
  }
}

export const periodLabel = (f: ListFilter) =>
  f.period === 'custom' ? `${f.from || '처음'} ~ ${f.to || '오늘'}` : PERIODS.find((p) => p.key === f.period)!.label

// 검색: 항목 · 구매처 · 메모
export function filterExpenses(expenses: Expense[], f: ListFilter, today: string) {
  const q = f.q.trim().toLowerCase()
  return expenses
    .filter(
      (x) =>
        inPeriod(x.date, f, today) &&
        (!f.category || x.category === f.category) &&
        (!q || [x.name, x.shop, x.note].join(' ').toLowerCase().includes(q)),
    )
    .sort(compareBy(SORT_COLUMNS, f.sort, newestFirst))
}

// ---------------------------------------------------------------- 요약 (EXP-05)

// 카드 3개는 기간 필터와 상관없이: 누적 투자금 · 누적 지출(전체 기간) · 이번 달
export function summarize(expenses: Expense[], today: string) {
  const invest = expenses.filter((x) => x.category === 'invest')
  const thisMonth = expenses.filter((x) => monthOf(x.date) === monthOf(today))
  return {
    invest: sum(invest),
    investCount: invest.length,
    total: sum(expenses),
    count: expenses.length,
    since: expenses.length ? expenses.map((x) => x.date).sort()[0] : null, // 가장 이른 지출 날짜
    thisMonth: sum(thisMonth),
    thisMonthCount: thisMonth.length,
  }
}

// 분류별 합계: 기간 필터를 따른다 (분류 · 검색 필터는 안 따름 — 분류를 눌러 고르는 곳이라)
export const byCategory = (expenses: Expense[]) =>
  CATEGORIES.map((c) => ({ ...c, amount: sum(expenses.filter((x) => x.category === c.key)) }))

// ---------------------------------------------------------------- 반복 지출 (EXP-04)

// 그 달의 결제일. 결제일이 그 달 말일보다 크면 말일 (31일 → 2월은 28일). 서버: RecurringExpense.pay_date
export function payDate(r: Pick<RecurringExpense, 'day'>, month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(Math.min(r.day, last)).padStart(2, '0')}`
}

// 이번 달에 넣을 반복 지출: 시작한 달이 지났고, 이번 달 결제일이 지났고(오늘 포함), 이번 달에 그 반복에서 넣은 줄이 없음
export function dueRecurring(recurring: RecurringExpense[], expenses: Expense[], today: string) {
  const month = monthOf(today)
  return recurring.filter(
    (r) =>
      monthOf(r.start) <= month &&
      payDate(r, month) <= today &&
      !expenses.some((x) => x.recurring === r.id && monthOf(x.date) === month),
  )
}

// ---------------------------------------------------------------- CSV (EXP-07)

const HEAD = ['날짜', '항목', '분류', '금액', '구매처', '주문 링크', '메모', '반복 지출']

// 보이는 목록 그대로 (검색 · 필터 · 정렬)
export function expensesCsv(rows: Expense[], recurring: RecurringExpense[]) {
  return toCsv([
    HEAD,
    ...rows.map((x) => [
      x.date,
      x.name,
      categoryInfo(x.category).label,
      x.amount,
      x.shop,
      x.url,
      x.note,
      x.recurring == null ? '' : (recurring.find((r) => r.id === x.recurring)?.name ?? ''),
    ]),
  ])
}
