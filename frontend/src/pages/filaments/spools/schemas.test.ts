import { describe, expect, it } from 'vitest'
import { purchaseSchema } from './schemas'

const purchase = (fields: Partial<Record<'quantity' | 'purchased_at' | 'price', string>>) =>
  purchaseSchema.safeParse({ quantity: '3', purchased_at: '2026-10-22', price: '', ...fields })

describe('재고 추가 (PRD INV-02)', () => {
  it('구매가를 비우면 null (서버가 색상 가격으로)', () => {
    const r = purchase({ price: '' })
    expect(r.success && r.data).toEqual({ quantity: 3, purchased_at: '2026-10-22', price: null })
  })

  it.each([
    ['0', '1 이상으로 입력하세요'],
    ['101', '100 이하로 입력하세요'],
  ])('수량 %j → 오류 %j', (quantity, message) => {
    expect(purchase({ quantity }).error?.issues[0].message).toBe(message)
  })
})
