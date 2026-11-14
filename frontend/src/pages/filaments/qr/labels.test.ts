import { describe, expect, it } from 'vitest'
import type { Color, Filament, Spool, SpoolStatus } from '../../../api/filaments'
import { baseUrl, chunk, initialPick, localOnly, needsLabel, qrUrl, search, toRows } from './labels'

const spool = (id: number, extra: Partial<Spool> = {}): Spool => ({
  id,
  code: `S${String(id).padStart(5, '0')}`,
  code_no: id,
  color: 1,
  status: 'sealed',
  price: 14000,
  purchased_at: '2026-10-27',
  opened_at: null,
  finished_at: null,
  note: '',
  buy: null,
  label_printed: false,
  ...extra,
})

const color = (id: number, name: string): Color => ({
  id,
  filament: 1,
  name,
  hex: '#FFFFFF',
  price: null,
  spool_price: 14000,
  price_per_g: 14,
  counts: { sealed: 0, open: 0, empty: 0 },
  last_buy: null,
})

const filament: Filament = {
  id: 1,
  brand: 1,
  brand_name: 'Bambu Lab',
  material: 1,
  material_name: 'PLA',
  series: 'Basic',
  display_name: 'Bambu Lab › PLA Basic',
  price: 14000,
  spool_g: 1000,
  avg_held_price: null,
  colors: [color(1, '화이트'), color(2, '블랙')],
}

describe('QR 주소', () => {
  it('PUBLIC_URL 이 있으면 그것, 없으면 지금 연 주소 (끝의 / 는 뺌)', () => {
    expect(baseUrl('http://192.168.0.10:5173/', 'http://localhost:5173')).toBe('http://192.168.0.10:5173')
    expect(baseUrl('', 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(qrUrl('http://192.168.0.10:5173', 'S00012')).toBe('http://192.168.0.10:5173/s/S00012')
  })

  it('localhost · 127.x 는 폰에서 안 열림', () => {
    expect(localOnly('http://localhost:5173')).toBe(true)
    expect(localOnly('http://127.0.0.1:5173')).toBe(true)
    expect(localOnly('http://192.168.0.10:5173')).toBe(false)
    expect(localOnly('http://hancheung.local:5173')).toBe(false)
  })
})

describe('라벨 없음', () => {
  it('라벨을 안 뽑은 재고 · 사용 중 스풀만 (다 쓴 스풀은 뺌)', () => {
    const statuses: [SpoolStatus, boolean, boolean][] = [
      ['sealed', false, true],
      ['open', false, true],
      ['empty', false, false],
      ['sealed', true, false],
    ]
    for (const [status, label_printed, expected] of statuses)
      expect(needsLabel(spool(1, { status, label_printed }))).toBe(expected)
  })
})

describe('목록', () => {
  it('색상 · 필라멘트를 붙이고 새 번호 먼저, 색상을 못 찾는 스풀은 뺌', () => {
    const rows = toRows([spool(3), spool(10, { color: 2 }), spool(7, { color: 99 })], [filament])
    expect(rows.map((r) => [r.spool.code, r.color.name])).toEqual([
      ['S00010', '블랙'],
      ['S00003', '화이트'],
    ])
  })

  it('코드 · 색상 · 필라멘트로 검색', () => {
    const rows = toRows([spool(3), spool(10, { color: 2 })], [filament])
    expect(search(rows, 's00003').map((r) => r.spool.id)).toEqual([3])
    expect(search(rows, '블랙').map((r) => r.spool.id)).toEqual([10])
    expect(search(rows, 'pla basic').length).toBe(2)
    expect(search(rows, '  ').length).toBe(2)
  })
})

describe('처음 골라 둘 스풀', () => {
  const spools = [
    spool(1, { buy: 5 }),
    spool(2, { buy: 5, label_printed: true }),
    spool(3, { buy: 5, status: 'empty' }),
    spool(4, { buy: 6 }),
    spool(5),
  ]

  it('재고 추가: 만든 스풀 그대로', () => {
    expect([...initialPick(spools, { ids: [5, 4] })].sort()).toEqual([4, 5])
  })

  it('지출 저장: 그 구매 항목의 스풀 중 라벨 없는 것', () => {
    expect([...initialPick(spools, { buys: [5] })]).toEqual([1])
  })

  it('QR 버튼으로 열면 아무것도 안 고름', () => {
    expect(initialPick(spools, null).size).toBe(0)
    expect(initialPick(spools, {}).size).toBe(0)
  })
})

it('A4 라벨지는 24칸씩 나눔', () => {
  expect(chunk([...Array(50).keys()], 24).map((g) => g.length)).toEqual([24, 24, 2])
})
