// 부자재 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/products/serializers.py
// 품목 이름 중복은 서버만 검사한다 (2차)
import { z } from 'zod'
import { decimal, money, text } from '../../validation'

// 서버: Part — name max_length=100(중복 불가), shop max_length=100, price MONEY(비우면 미입력),
//       pack_qty DecimalField(max_digits=10, decimal_places=2, 0.01 이상), unit max_length=10
export const partSchema = z.object({
  name: text(100),
  shop: text(100, false),
  price: money,
  pack_qty: decimal(0.01, 99_999_999.99, 2),
  unit: text(10, false).transform((v) => v || '개'), // 비우면 기본 단위
  note: z.string().trim(),
})

// 입력 중인 구매가 · 묶음 수량 → 개당 단가 미리보기. 구매가가 없거나 칸이 틀리면 null
export function previewUnitPrice(price: string, packQty: string) {
  const p = partSchema.shape.price.safeParse(price)
  const q = partSchema.shape.pack_qty.safeParse(packQty)
  if (!p.success || !q.success || p.data == null) return null
  return { price: p.data, packQty: q.data, unitPrice: p.data / q.data }
}
