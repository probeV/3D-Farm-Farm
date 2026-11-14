// 부자재 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/products/serializers.py
// 품목 이름 중복은 서버만 검사한다 (2차)
import { z } from 'zod'
import { decimal, money, text } from '../../validation'

// 서버: Part — name max_length=100(중복 불가), category(비우면 미분류), shop max_length=100, buy_url URLField(max_length=500), price MONEY(비우면 미입력),
//       pack_qty DecimalField(max_digits=10, decimal_places=2, 0.01 이상), unit max_length=10
export const partSchema = z.object({
  name: text(100),
  category: z.string().transform((v) => (v === '' ? null : Number(v))), // 빈칸 = 미분류
  shop: text(100, false),
  // 구매 링크: 비워도 됨. 넣으면 https:// (또는 http://) 로 시작하는 주소
  buy_url: text(500, false).refine(
    (v) => !v || /^https?:\/\/\S+\.\S+$/.test(v),
    'https:// 로 시작하는 주소로 입력하세요',
  ),
  price: money,
  pack_qty: decimal(0.01, 99_999_999.99, 2),
  unit: text(10, false).transform((v) => v || '개'), // 비우면 기본 단위
  // v2 STOCK: 부족 알림 기준 · 처음 수량 (추가할 때만 보냄). 소수 2자리, 0 이상
  alert: decimal(0, 9_999_999_999.99, 2),
  stock: decimal(0, 9_999_999_999.99, 2),
  note: z.string().trim(),
})

// 남은 수량 조정 (STOCK-04). 빼기 · 더하기는 0 보다 커야 함 (서버도 같은 검사)
export const adjustSchema = z
  .object({
    mode: z.enum(['set', 'sub', 'add']),
    qty: decimal(0, 9_999_999_999.99, 2),
    note: text(180, false),
  })
  .refine((v) => v.mode === 'set' || v.qty > 0, { path: ['qty'], message: '0 보다 큰 수량을 넣으세요' })

// 입력 중인 구매가 · 묶음 수량 → 개당 단가 미리보기. 구매가가 없거나 칸이 틀리면 null
export function previewUnitPrice(price: string, packQty: string) {
  const p = partSchema.shape.price.safeParse(price)
  const q = partSchema.shape.pack_qty.safeParse(packQty)
  if (!p.success || !q.success || p.data == null) return null
  return { price: p.data, packQty: q.data, unitPrice: p.data / q.data }
}
