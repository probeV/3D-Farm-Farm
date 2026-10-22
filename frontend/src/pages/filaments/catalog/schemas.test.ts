import { describe, expect, it } from 'vitest'
import { brandSchema, colorSchema, filamentSchema, hex } from './schemas'

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0].message

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
