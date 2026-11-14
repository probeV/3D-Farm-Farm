import { describe, expect, it } from 'vitest'
import type { ByStatus, Color, Filament } from '../../api/filaments'
import { colorState, filamentKg, heldOf, sumByStatus, totalOf } from './stock'

const counts = (sealed: number, open: number, empty: number): ByStatus => ({ sealed, open, empty })

const color = (id: number, c: ByStatus): Color => ({
  id,
  filament: 1,
  name: `색상${id}`,
  hex: '#FFFFFF',
  price: null,
  spool_price: 14400,
  price_per_g: 14.4,
  counts: c,
  held_price: null,
})

const filament = (spool_g: number, colors: Color[]): Filament => ({
  id: 1,
  brand: 1,
  brand_name: 'Bambu Lab',
  material: 1,
  material_name: 'PLA',
  series: '',
  display_name: 'Bambu Lab › PLA',
  price: 14400,
  spool_g,
  avg_held_price: null,
  colors,
})

describe('필라멘트 상태별 kg = Σ 색상별 스풀 개수 × 스풀 무게 (docs/api.md)', () => {
  it('색상들의 개수를 더해 kg 으로', () => {
    const f = filament(1000, [color(1, counts(3, 1, 2)), color(2, counts(2, 1, 4))])
    expect(filamentKg(f)).toEqual({ sealed: 5, open: 2, empty: 6 })
  })

  it('스풀 무게가 500g 이면 절반', () => {
    expect(filamentKg(filament(500, [color(1, counts(3, 1, 0))]))).toEqual({ sealed: 1.5, open: 0.5, empty: 0 })
  })

  it('색상이 없으면 0', () => {
    expect(filamentKg(filament(1000, []))).toEqual({ sealed: 0, open: 0, empty: 0 })
  })

  it('보유 = 재고 + 사용 중, 전체 = 셋 다', () => {
    const kg = counts(5, 2, 6)
    expect(heldOf(kg)).toBe(7)
    expect(totalOf(kg)).toBe(13)
  })

  it('회사별 합계', () => {
    expect(sumByStatus([counts(1, 2, 3), counts(4, 5, 6)])).toEqual({ sealed: 5, open: 7, empty: 9 })
  })
})

describe('색상 상태 (PRD INV-01)', () => {
  it.each([
    [counts(1, 0, 0), 'ok'],
    [counts(1, 3, 5), 'ok'],
    [counts(0, 1, 0), 'noStock'], // 재고 없음: 사용 중만 남음 (주황)
    [counts(0, 0, 4), 'usedUp'], // 소진: 재고도 사용 중도 없음 (빨강)
    [counts(0, 0, 0), 'usedUp'], // 스풀이 하나도 없어도 소진
  ])('%j → %s', (c, expected) => {
    expect(colorState(color(1, c))).toBe(expected)
  })
})
