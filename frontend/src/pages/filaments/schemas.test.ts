import { describe, expect, it } from 'vitest'
import { brandSchema, colorSchema, filamentSchema, hex, purchaseSchema } from './schemas'

const purchase = (fields: Partial<Record<'quantity' | 'purchased_at' | 'price' | 'code_nos', string>>) =>
  purchaseSchema.safeParse({ quantity: '3', purchased_at: '2026-10-22', price: '', code_nos: '', ...fields })

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0].message

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
    expect(firstError(purchase({ quantity: '100', code_nos: input }))).toBe(message)
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

describe('색상 코드 (PRD FIL-05)', () => {
  it.each([
    ['F5F5F5', '#F5F5F5'],
    ['#f5f5f5', '#F5F5F5'],
    [' #1e90ff ', '#1E90FF'],
  ])('%j → %j 로 저장', (input, expected) => {
    expect(hex.safeParse(input)).toMatchObject({ success: true, data: expected })
  })

  it.each(['#FFF', 'GGGGGG', '#F5F5F5F', ''])('%j → 오류', (input) => {
    expect(firstError(hex.safeParse(input))).toBe('# 과 16진수 6자리로 입력하세요')
  })

  it('색상: 이름 · 코드 · 가격(비우면 필라멘트 가격)', () => {
    expect(colorSchema.safeParse({ name: ' 화이트 ', hex: 'f5f5f5', price: '' })).toMatchObject({
      success: true,
      data: { name: '화이트', hex: '#F5F5F5', price: null },
    })
  })
})

describe('필라멘트 (PRD FIL-03)', () => {
  it('재질 id · 시리즈(선택) · 가격 · 무게', () => {
    expect(filamentSchema.safeParse({ material: '2', series: '', price: '24,900', spool_g: '750.5' })).toMatchObject({
      success: true,
      data: { material: 2, series: '', price: 24900, spool_g: 750.5 },
    })
  })

  it('재질을 고르지 않으면 오류', () => {
    const r = filamentSchema.safeParse({ material: '', series: '', price: '', spool_g: '1000' })
    expect(firstError(r)).toBe('재질을 고르세요')
  })
})

describe('회사 로고 (PRD FIL-01a: png · jpg · webp, 5MB 까지)', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'logo', { type })

  it.each(['image/png', 'image/jpeg', 'image/webp'])('%s 허용', (type) => {
    expect(brandSchema.safeParse({ name: 'Esun', logo: file(type) }).success).toBe(true)
  })

  it('로고 없이도 저장 가능', () => {
    expect(brandSchema.safeParse({ name: 'Esun', logo: null }).success).toBe(true)
  })

  it('다른 형식은 오류', () => {
    expect(firstError(brandSchema.safeParse({ name: 'Esun', logo: file('image/gif') }))).toBe(
      'png, jpg, webp 이미지만 올릴 수 있어요',
    )
  })

  it('5MB 를 넘으면 오류', () => {
    const big = file('image/png', 5 * 1024 * 1024 + 1)
    expect(firstError(brandSchema.safeParse({ name: 'Esun', logo: big }))).toBe('이미지는 5MB 까지 올릴 수 있어요')
    expect(brandSchema.safeParse({ name: 'Esun', logo: file('image/png', 5 * 1024 * 1024) }).success).toBe(true)
  })
})
