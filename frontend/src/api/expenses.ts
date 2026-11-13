// 지출 화면 API — 지출 · 반복 지출 (docs/api.md "지출")
// 요약 · 분류별 합계 · 넣을 반복 지출은 서버가 주지 않는다. 화면이 pages/expenses/expenseList.ts 로 계산한다
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, send } from './client'

// 분류 (EXP-03, 고정 8개). 이름 · 설명은 pages/expenses/categories.ts
export type ExpenseCategory = 'invest' | 'filament' | 'part' | 'pack' | 'supply' | 'sub' | 'sell' | 'etc'

// 구매 항목 (v2 TBD-31 · 33): 필라멘트 지출은 색상 · 롤 수, 부속품 · 포장재 · 소모품 지출은 그 탭의 품목 · 수량.
// 같은 색상 · 품목도 여러 항목 가능. 필라멘트 항목을 저장하면 롤 수만큼 스풀이 생긴다 (지출 → 스풀 한 방향, 차이만)
export interface ExpenseItem {
  id: number
  color: number | null
  part: number | null
  qty: number
  amount: number | null // 직접 적은 금액. null = 총액에서 나눠 넣음
  total: number // 항목 금액 (적은 금액 또는 나눈 금액)
  each: number // 1개(롤)당 = total ÷ qty
  name: string // `Bambu Lab › PLA Basic · 화이트` / 품목 이름
  unit: string // `롤` / 품목 단위
  spools: number // 이 항목으로 만든 스풀 수 (필라멘트, 스풀에서 지운 것은 빠짐)
  used: number // 그중 사용한(사용 중 · 사용 완료) 수 — 이만큼은 지출에서 줄이거나 색상을 바꾸거나 뺄 수 없음
}

// 보낼 때: 기존 항목은 id 를 함께 (그 항목으로 만든 스풀이 이어짐). 안 보낸 기존 항목은 지워짐
export type ExpenseItemInput = Pick<ExpenseItem, 'color' | 'part' | 'qty' | 'amount'> & { id?: number }

export interface Expense {
  id: number
  date: string // "2026-10-21"
  name: string
  category: ExpenseCategory
  amount: number
  shop: string
  note: string
  recurring: number | null // 반복 지출에서 넣은 줄이면 그 id (반복 지출을 지우면 null)
  items: ExpenseItem[] // 구매 항목. 필라멘트 · 부속품 · 포장재 · 소모품 지출만, 비어 있을 수 있음
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

// 저장한 뒤 다시 불러오기. 넣은 지출 수가 반복 지출 목록에도 나오고, 구매 항목이 남은 수량 · 단가(색상 가격 ·
// 묶음 가격) · 제품 원가 · 스풀까지 바꾸므로 (TBD-31 · 33) 모든 목록을 무효화한다
export function useRefreshExpenses() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries()
}

// ---------------------------------------------------------------- 쓰기

export type ExpenseInput = Omit<Expense, 'id' | 'items'> & { items?: ExpenseItemInput[] }

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
