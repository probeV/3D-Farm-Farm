import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { materialSchema } from './pages/filaments/catalog/schemas'
import { purchaseSchema } from './pages/filaments/spools/schemas'
import { amount, date, decimal, fieldErrors, intRange, money, selectedId, text, validate } from './validation'

// 성공하면 변환된 값, 실패하면 첫 오류 문구
const check = (schema: z.ZodType, input: unknown) => {
  const r = schema.safeParse(input)
  return r.success ? { ok: r.data } : { error: r.error.issues[0].message }
}

describe('money (금액: 비우면 null, 0 이상의 정수)', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0', 0],
    ['13850', 13850],
    ['13,850', 13850], // 천 단위 쉼표
    [' 500 ', 500],
  ])('%j → %j', (input, expected) => {
    expect(check(money, input)).toEqual({ ok: expected })
  })

  it.each([
    ['-500', '0 이상으로 입력하세요'],
    ['1.5', '원 단위 정수로 입력하세요'],
    ['abc', '숫자로 입력하세요'],
    ['-', '숫자로 입력하세요'], // 예전에 0 으로 저장되던 입력
    ['10000000000', '금액이 너무 커요'], // 서버 max_digits=10
  ])('%j → 오류 %j', (input, message) => {
    expect(check(money, input)).toEqual({ error: message })
  })
})

describe('amount (꼭 넣는 금액: 1 이상의 정수)', () => {
  it('쉼표 허용', () => expect(check(amount, '29,000')).toEqual({ ok: 29000 }))
  it.each([
    ['', '입력하세요'],
    ['0', '1원 이상으로 입력하세요'],
    ['1.5', '원 단위 정수로 입력하세요'],
  ])('%j → 오류 %j', (input, message) => {
    expect(check(amount, input)).toEqual({ error: message })
  })
})

describe('intRange(1, 100) (수량)', () => {
  it('범위 안의 정수', () => {
    expect(check(intRange(1, 100), '1')).toEqual({ ok: 1 })
    expect(check(intRange(1, 100), '100')).toEqual({ ok: 100 })
  })

  it.each([
    ['', '입력하세요'],
    ['0', '1 이상으로 입력하세요'],
    ['101', '100 이하로 입력하세요'],
    ['1.5', '정수로 입력하세요'],
    ['x', '숫자로 입력하세요'],
  ])('%j → 오류 %j', (input, message) => {
    expect(check(intRange(1, 100), input)).toEqual({ error: message })
  })
})

describe('decimal (소수 자리 제한)', () => {
  const spoolG = decimal(1, 999_999.9, 1) // 스풀 무게

  it.each([
    ['1000', 1000],
    ['750.5', 750.5],
    ['1,000.5', 1000.5],
  ])('%j → %j', (input, expected) => {
    expect(check(spoolG, input)).toEqual({ ok: expected })
  })

  it('2진수로 정확히 안 떨어지는 소수도 통과 (0.3 × 10 = 3.0000000000000004)', () => {
    expect(check(decimal(0, 10, 1), '0.3')).toEqual({ ok: 0.3 })
  })

  it.each([
    ['1000.55', '소수 1자리까지 입력하세요'],
    ['0.5', '1 이상으로 입력하세요'],
    ['1000000', '999999.9 이하로 입력하세요'],
    ['', '입력하세요'],
  ])('%j → 오류 %j', (input, message) => {
    expect(check(spoolG, input)).toEqual({ error: message })
  })
})

describe('text (글자)', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(check(text(50), '  Bambu Lab  ')).toEqual({ ok: 'Bambu Lab' })
  })

  it('필수면 빈칸 · 공백만 있으면 오류', () => {
    expect(check(text(50), '')).toEqual({ error: '입력하세요' })
    expect(check(text(50), '   ')).toEqual({ error: '입력하세요' })
  })

  it('선택이면 빈칸 허용', () => {
    expect(check(text(50, false), '')).toEqual({ ok: '' })
  })

  it('최대 글자 수 (서버 max_length)', () => {
    expect(check(text(50), 'a'.repeat(50))).toEqual({ ok: 'a'.repeat(50) })
    expect(check(text(50), 'a'.repeat(51))).toEqual({ error: '50자까지 입력할 수 있어요' })
  })
})

describe('selectedId · date', () => {
  it('선택 상자 값 → 숫자 id', () => {
    expect(check(selectedId('재질을 고르세요'), '3')).toEqual({ ok: 3 })
    expect(check(selectedId('재질을 고르세요'), '')).toEqual({ error: '재질을 고르세요' })
  })

  it('날짜는 YYYY-MM-DD', () => {
    expect(check(date, '2026-10-22')).toEqual({ ok: '2026-10-22' })
    expect(check(date, '')).toEqual({ error: '날짜를 입력하세요' })
  })
})

describe('fieldErrors · validate', () => {
  it('칸마다 첫 오류만 모은다', () => {
    const r = purchaseSchema.safeParse({ quantity: '', purchased_at: '', price: '-1', code_nos: '' })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(fieldErrors(r.error)).toEqual({
        quantity: '입력하세요',
        purchased_at: '날짜를 입력하세요',
        price: '0 이상으로 입력하세요',
      })
  })

  it('통과하면 빈 객체 (입력할 때 다시 검사해서 오류를 지울 때 사용)', () => {
    expect(validate(materialSchema, { name: 'PLA' })).toEqual({})
    expect(validate(materialSchema, { name: '' })).toEqual({ name: '입력하세요' })
  })
})
