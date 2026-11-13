// 지출 · 반복 지출 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/expenses/serializers.py
// 같은 반복 지출을 같은 달에 두 번 넣는 것은 서버만 검사한다 (2차)
import { z } from 'zod'
import { today } from '../../format'
import { amount, date, intRange, text } from '../../validation'
import { CATEGORY_KEYS } from './categories'

const category = z.enum(CATEGORY_KEYS, { error: '분류를 고르세요' })

// 서버: Expense — date(오늘 이후 불가), name max_length=100, category(8개 중 하나), amount MONEY 1 이상,
//       shop max_length=100. 구매 줄은 buyRows.ts checkRows
export const expenseSchema = z.object({
  date: date.refine((v) => v <= today(), '오늘 이후 날짜는 넣을 수 없어요'),
  name: text(100),
  category,
  amount,
  shop: text(100, false),
  note: z.string().trim(),
})

// 서버: RecurringExpense — name max_length=100, amount MONEY 1 이상, day 1~31, start(그 달 1일로 저장)
export const recurringSchema = z.object({
  name: text(100),
  category,
  amount,
  day: intRange(1, 31),
  // 시작 달: type="month" 입력칸의 "2026-06" → 서버에는 "2026-06-01"
  start: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '시작 달을 고르세요')
    .transform((v) => `${v}-01`),
  note: z.string().trim(),
})
