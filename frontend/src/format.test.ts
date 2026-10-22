import { describe, expect, it } from 'vitest'
import { dateText, kgText, won } from './format'

describe('화면 표시 모양', () => {
  it('원: 원 단위 반올림 + 천 단위 쉼표, 없으면 "-"', () => {
    expect(won(14400)).toBe('14,400원')
    expect(won(14.4 * 1000.6)).toBe('14,409원')
    expect(won(0)).toBe('0원')
    expect(won(null)).toBe('-')
  })

  it('kg: 소수 첫째 자리까지', () => {
    expect(kgText(12)).toBe('12')
    expect(kgText(2.25)).toBe('2.3')
    expect(kgText(0.5)).toBe('0.5')
    expect(kgText(1234.5)).toBe('1,234.5')
  })

  it('날짜: 시각을 떼고 날짜만, 없으면 "-"', () => {
    expect(dateText('2026-10-20T13:33:30+09:00')).toBe('2026-10-20')
    expect(dateText('2026-10-20')).toBe('2026-10-20')
    expect(dateText(null)).toBe('-')
  })
})
