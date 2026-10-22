import { describe, expect, it } from 'vitest'
import { purchaseSchema } from './schemas'

const purchase = (fields: Partial<Record<'quantity' | 'purchased_at' | 'price' | 'code_nos', string>>) =>
  purchaseSchema.safeParse({ quantity: '3', purchased_at: '2026-10-22', price: '', code_nos: '', ...fields })

describe('재고 추가 — 번호 지정 (PRD INV-02)', () => {
  it.each([
    ['', []],
    ['11', [11]],
    ['11, 15', [11, 15]],
    ['20-22', [20, 21, 22]],
    ['20 - 22', [20, 21, 22]],
    ['S00011', [11]], // 코드로 적어도 됨
    ['s11, S20-S21', [11, 20, 21]], // 대소문자 무관
    ['11,,15,', [11, 15]], // 빈 칸은 무시
  ])('%j → %j', (input, expected) => {
    const r = purchase({ quantity: '100', code_nos: input })
    expect(r.success && r.data.code_nos).toEqual(expected)
  })

  it.each([
    ['abc', '번호 형식을 확인하세요: abc'],
    ['11-', '번호 형식을 확인하세요: 11-'],
    ['30-20', '범위를 확인하세요: 30-20'],
    ['0', '범위를 확인하세요: 0'],
    ['1-101', '번호는 100개까지 지정할 수 있어요'],
  ])('%j → 오류 %j', (input, message) => {
    expect(purchase({ quantity: '100', code_nos: input }).error?.issues[0].message).toBe(message)
  })

  it('지정한 번호가 수량보다 많으면 오류 (번호 칸에 표시)', () => {
    const r = purchase({ quantity: '1', code_nos: '11, 12' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]).toMatchObject({ path: ['code_nos'], message: '지정한 번호가 수량보다 많아요' })
  })

  it('구매가를 비우면 null (서버가 색상 가격으로)', () => {
    const r = purchase({ price: '' })
    expect(r.success && r.data).toEqual({ quantity: 3, purchased_at: '2026-10-22', price: null, code_nos: [] })
  })
})
