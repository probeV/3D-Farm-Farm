// 스풀 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/filaments/serializers.py
import { z } from 'zod'
import { date, intRange, money } from '../../../validation'

// "11, 15, 20-25" → [11, 15, 20, 21, …, 25]. S00011 처럼 코드로 적어도 됨. 비우면 [] (전부 자동)
const codeNos = z.string().transform((text, ctx) => {
  const fail = (message: string) => {
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
  }
  const nos: number[] = []
  for (const part of text.split(',').map((s) => s.trim())) {
    if (!part) continue
    const m = part.match(/^S?(\d+)(?:\s*-\s*S?(\d+))?$/i)
    if (!m) return fail(`번호 형식을 확인하세요: ${part}`)
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (from < 1 || to < from) return fail(`범위를 확인하세요: ${part}`)
    if (nos.length + (to - from + 1) > 100) return fail('번호는 100개까지 지정할 수 있어요')
    for (let n = from; n <= to; n++) nos.push(n)
  }
  return nos
})

// 재고 추가 (PRD INV-02). 서버: PurchaseSerializer — 이미 있는 번호는 서버만 알 수 있어서 2차에서 걸린다
export const purchaseSchema = z
  .object({
    quantity: intRange(1, 100),
    purchased_at: date,
    price: money, // 비우면(null) 보내지 않음 → 서버가 색상 가격으로
    code_nos: codeNos,
  })
  .refine((v) => v.code_nos.length <= v.quantity, {
    path: ['code_nos'],
    message: '지정한 번호가 수량보다 많아요',
  })
