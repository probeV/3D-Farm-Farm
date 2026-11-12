// 판매 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/sales/serializers.py
// 주문번호 중복은 서버만 검사한다 (2차)
import { z } from 'zod'
import { today } from '../../format'
import { date, intRange, money, text } from '../../validation'
import { CHANNELS } from './channels'

const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as ['store', 'direct', 'etc']
const required = money.refine((v) => v != null, '입력하세요')
const zeroIfEmpty = money.transform((v) => v ?? 0)

// 제품 줄 하나. 제품을 지운 줄(product 빈칸)은 팔 때 이름(product_name)이 있어야 다시 저장할 수 있다
// 서버: SaleItem — qty 1 이상, unit_price MONEY, unit_cost MONEY 또는 null
const item = z
  .object({
    product: z.string(),
    product_name: z.string(),
    qty: intRange(1, 999_999),
    unit_price: required,
    unit_cost: z.number().nullable(), // 원가는 입력칸이 아니라 화면이 복사해 둔 값
  })
  .superRefine((v, ctx) => {
    if (!v.product && !v.product_name) ctx.addIssue({ code: 'custom', path: ['product'], message: '제품을 고르세요' })
  })
  .transform((v) => ({ ...v, product: v.product ? Number(v.product) : null, unit_price: v.unit_price as number }))

// 서버: Sale — date(오늘 이후 불가), channel(3개 중 하나), order_no max_length=50, items 한 줄 이상
export const saleSchema = z.object({
  date: date.refine((v) => v <= today(), '오늘 이후 날짜는 넣을 수 없어요'),
  channel: z.enum(CHANNEL_KEYS, { error: '판매처를 고르세요' }),
  order_no: text(50, false),
  items: z.array(item).min(1, '제품을 한 개 이상 넣으세요'),
  shipping_received: zeroIfEmpty,
  fee: zeroIfEmpty,
  shipping_cost: zeroIfEmpty,
  note: z.string().trim(),
})
