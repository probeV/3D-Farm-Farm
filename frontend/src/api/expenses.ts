// 지출 화면 API — 지출 · 반복 지출 (docs/api.md "지출")
// 요약 · 분류별 합계 · 넣을 반복 지출은 서버가 주지 않는다. 화면이 pages/expenses/expenseList.ts 로 계산한다
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

// 분류 (EXP-03, 고정 7개). 이름 · 설명은 pages/expenses/categories.ts
export type ExpenseCategory = 'invest' | 'filament' | 'part' | 'supply' | 'sub' | 'sell' | 'etc'

export interface Expense {
  id: number
  date: string // "2026-10-21"
  name: string
  category: ExpenseCategory
  amount: number
  shop: string
  url: string // 주문 링크, 빈 문자열 = 없음
  note: string
  recurring: number | null // 반복 지출에서 넣은 줄이면 그 id (반복 지출을 지우면 null)
}

export interface RecurringExpense {
  id: number
  name: string
  category: ExpenseCategory
  amount: number
  day: number // 결제일 1~31 (그 달 말일보다 크면 말일)
  start: string // 시작 달 "2026-06-01" (항상 1일)
  note: string
  expense_count: number // 이 반복에서 넣은 지출 수
}

export const keys = {
  expenses: ['expenses'] as const,
  recurring: ['recurring-expenses'] as const,
}

// 최근 날짜순 (같은 날이면 나중에 넣은 것 먼저)
export const useExpenses = () => useQuery({ queryKey: keys.expenses, queryFn: () => api<Expense[]>('/expenses/') })

export const useRecurringExpenses = () =>
  useQuery({ queryKey: keys.recurring, queryFn: () => api<RecurringExpense[]>('/recurring-expenses/') })

// 저장한 뒤 다시 불러오기. 넣은 지출 수가 반복 지출 목록에도 나오므로 둘 다 무효화한다
export function useRefreshExpenses() {
  const queryClient = useQueryClient()
  return () => Promise.all(Object.values(keys).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

// ---------------------------------------------------------------- 쓰기

export type ExpenseInput = Omit<Expense, 'id'>

// 여러 줄을 한 번에 (이번 달 반복 지출 넣기): 하나라도 틀리면 아무것도 넣지 않음.
// 같은 반복 지출을 같은 달에 또 넣으면 400 `{"recurring": ["이 달에 이미 넣은 반복 지출입니다."]}`
export const createExpense = (body: ExpenseInput) => send<Expense>('POST', '/expenses/', body)
export const createExpenses = (body: ExpenseInput[]) => send<Expense[]>('POST', '/expenses/', body)
export const updateExpense = (id: number, body: Partial<ExpenseInput>) =>
  send<Expense>('PATCH', `/expenses/${id}/`, body)
export const deleteExpense = (id: number) => send<null>('DELETE', `/expenses/${id}/`)

export type RecurringInput = Omit<RecurringExpense, 'id' | 'expense_count'>

// 지워도 그 반복에서 넣은 지출은 남는다 (recurring 이 null 이 됨)
export const createRecurring = (body: RecurringInput) => send<RecurringExpense>('POST', '/recurring-expenses/', body)
export const updateRecurring = (id: number, body: Partial<RecurringInput>) =>
  send<RecurringExpense>('PATCH', `/recurring-expenses/${id}/`, body)
export const deleteRecurring = (id: number) => send<null>('DELETE', `/recurring-expenses/${id}/`)
