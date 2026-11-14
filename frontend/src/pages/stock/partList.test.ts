import { describe, expect, it } from 'vitest'
import type { PackSet, Part, Product } from '../../api/products'
import { fieldErrors } from '../../validation'
import {
  canPack,
  filterParts,
  inShop,
  NO_FILTER,
  setCost,
  setsByPart,
  shopsOf,
  summarize,
  usagesByPart,
} from './partList'
import { partSchema, previewUnitPrice } from './schemas'

const part = (p: Partial<Part>): Part => ({
  id: 1,
  kind: 'part',
  name: '',
  category: null,
  shop: '',
  buy_url: '',
  price: 1000,
  pack_qty: 10,
  unit: '개',
  unit_price: 100,
  avg_price: 100,
  note: '',
  product_count: 0,
  photo: null,
  stock: 100,
  alert: 0,
  set_count: 0,
  last_used: null,
  bought: false,
  ...p,
})

const product = (p: Partial<Product>): Product => ({
  id: 1,
  no: 1,
  category: null,
  subcategory: null,
  name: '',
  status: 'on_sale',
  print_minutes: 60,
  sale_price: 1000,
  default_pack: null,
  note: '',
  filaments: [],
  parts: [],
  created_at: '',
  updated_at: '',
  ...p,
})

const magnet = part({ id: 1, name: '자석', shop: '알리', unit_price: 60, product_count: 2, note: 'N52' })
const bag = part({ id: 2, name: 'OPP 봉투', shop: '쿠팡', unit_price: 17.8, product_count: 1 })
const wrap = part({ id: 3, name: '에어캡', shop: '', price: null, unit_price: null, product_count: 0 })
const box = part({ id: 4, name: '박스', shop: '쿠팡', unit_price: 440, product_count: 1 })
const parts = [magnet, bag, wrap, box]

const products = [
  product({
    id: 1,
    name: '분수 원판',
    parts: [
      { id: 1, part: 1, qty: 12 },
      { id: 2, part: 2, qty: 1 },
      { id: 3, part: 1, qty: 3 },
    ],
  }),
  product({
    id: 2,
    name: '전개도 모형',
    status: 'developing',
    parts: [
      { id: 4, part: 1, qty: 20 },
      { id: 5, part: 3, qty: 1 },
    ],
  }),
  product({ id: 3, name: '무드등', parts: [{ id: 6, part: 4, qty: 1 }] }),
  product({ id: 4, name: '칠교', parts: [] }),
]

const names = (list: Part[]) => list.map((p) => p.name)

describe('부자재 목록 (PART-01)', () => {
  it('기본은 이름순', () => {
    expect(names(filterParts(parts, NO_FILTER))).toEqual(['박스', '에어캡', '자석', 'OPP 봉투'])
  })

  it('검색: 품목 · 구매처 · 비고', () => {
    expect(names(filterParts(parts, { ...NO_FILTER, q: '쿠팡' }))).toEqual(['박스', 'OPP 봉투'])
    expect(names(filterParts(parts, { ...NO_FILTER, q: 'n52' }))).toEqual(['자석'])
  })

  it('가격 미입력만 보기', () => {
    expect(names(filterParts(parts, { ...NO_FILTER, noPriceOnly: true }))).toEqual(['에어캡'])
  })

  it('카테고리 필터 · 미분류 (TBD-17)', () => {
    const list = [part({ name: '자석', category: 1 }), part({ name: '박스', category: 2 }), part({ name: '스티커' })]
    expect(names(filterParts(list, { ...NO_FILTER, category: 'c:1' }))).toEqual(['자석'])
    expect(names(filterParts(list, { ...NO_FILTER, category: 'none' }))).toEqual(['스티커'])
  })

  it('열 제목 정렬: 가격 · 구매처가 없는 것은 방향과 상관없이 맨 뒤', () => {
    expect(names(filterParts(parts, { ...NO_FILTER, sort: { key: 'unitPrice', dir: 'desc' } }))).toEqual([
      '박스',
      '자석',
      'OPP 봉투',
      '에어캡',
    ])
    expect(names(filterParts(parts, { ...NO_FILTER, sort: { key: 'used', dir: 'desc' } }))).toEqual([
      '자석',
      '박스',
      'OPP 봉투',
      '에어캡',
    ])
    expect(names(filterParts(parts, { ...NO_FILTER, sort: { key: 'shop', dir: 'asc' } }))).toEqual([
      '자석',
      '박스',
      'OPP 봉투',
      '에어캡',
    ])
    expect(names(filterParts(parts, { ...NO_FILTER, sort: { key: 'unitPrice', dir: 'asc' } })).pop()).toBe('에어캡')
  })
})

describe('사용하는 제품 · 요약 (PART-03)', () => {
  it('부자재별 사용하는 제품: 같은 제품에 두 줄이면 수량을 합친다', () => {
    const usages = usagesByPart(products)
    expect(usages.get(1)).toEqual([
      { productId: 1, name: '분수 원판', status: 'on_sale', qty: 15 },
      { productId: 2, name: '전개도 모형', status: 'developing', qty: 20 },
    ])
    expect(usages.get(5)).toBeUndefined()
  })

  it('요약: 사용 · 가격 미입력 · 부족 · 남은 금액 (STOCK-04)', () => {
    const s = summarize(parts)
    expect([s.total, s.used, s.unused, s.noPrice]).toEqual([4, 3, 1, 1])
    // 남은 수량 100 × 단가 (가격 없는 것은 0)
    expect(s.value).toBe(parts.reduce((a, p) => a + 100 * (p.unit_price ?? 0), 0))
    expect(s.low).toEqual([])
    const low = summarize([part({ id: 1, stock: 3, alert: 5 }), part({ id: 2, stock: 0 }), part({ id: 3, stock: -2 })])
    expect(low.low.map((p) => p.id)).toEqual([1, 2, 3])
    expect(low.value).toBe(300) // 0 아래는 0 으로
  })

  it('관리 창 구매처 목록 · 선택', () => {
    expect(shopsOf(parts)).toEqual(['알리', '쿠팡'])
    expect(parts.filter((p) => inShop(p, 's:쿠팡')).map((p) => p.id)).toEqual([2, 4])
    expect(parts.filter((p) => inShop(p, 'none')).map((p) => p.id)).toEqual([3])
    expect(parts.filter((p) => inShop(p, '')).length).toBe(4)
  })
})

describe('부자재 폼 검증 (PART-02)', () => {
  const values = {
    name: ' 자석 ',
    category: '',
    shop: '',
    buy_url: '',
    price: '12,000',
    pack_qty: '200',
    unit: '',
    alert: '0',
    stock: '0',
    note: '',
  }

  it('글자 → 서버로 보낼 값 (단위를 비우면 "개", 구매가를 비우면 미입력, 카테고리를 비우면 미분류)', () => {
    expect(partSchema.parse(values)).toEqual({
      name: '자석',
      category: null,
      shop: '',
      buy_url: '',
      price: 12000,
      pack_qty: 200,
      unit: '개',
      alert: 0,
      stock: 0,
      note: '',
    })
    expect(partSchema.parse({ ...values, price: '' }).price).toBeNull()
    expect(partSchema.parse({ ...values, category: '3' }).category).toBe(3)
  })

  it('구매 링크: 비워도 되고, 넣으면 https:// 주소 (TBD-20)', () => {
    expect(partSchema.parse({ ...values, buy_url: ' https://example.com/a ' }).buy_url).toBe('https://example.com/a')
    const r = partSchema.safeParse({ ...values, buy_url: 'example.com' })
    expect(r.success ? {} : fieldErrors(r.error)).toEqual({ buy_url: 'https:// 로 시작하는 주소로 입력하세요' })
  })

  it('품목 필수, 묶음 수량은 0.01 이상 · 소수 2자리까지', () => {
    const r = partSchema.safeParse({ ...values, name: ' ', pack_qty: '0' })
    expect(r.success ? {} : fieldErrors(r.error)).toEqual({ name: '입력하세요', pack_qty: '0.01 이상으로 입력하세요' })
    expect(partSchema.safeParse({ ...values, pack_qty: '1.255' }).success).toBe(false)
  })

  it('개당 단가 미리보기: 구매가가 없거나 칸이 틀리면 null', () => {
    expect(previewUnitPrice('12,000', '200')).toEqual({ price: 12000, packQty: 200, unitPrice: 60 })
    expect(previewUnitPrice('', '200')).toBeNull()
    expect(previewUnitPrice('12000', '0')).toBeNull()
  })
})

describe('부족 · 포장 세트 (STOCK-04 · 06)', () => {
  const bag = part({ id: 1, kind: 'pack', unit_price: 17.8, stock: 30 })
  const box = part({ id: 2, kind: 'pack', unit_price: 440, stock: 3 })
  const tape = part({ id: 3, kind: 'pack', unit_price: null, stock: -1 })
  const byId = new Map([bag, box, tape].map((p) => [p.id, p]))
  const pack = (id: number, lines: [number, number][]): PackSet => ({
    id,
    name: `세트 ${id}`,
    note: '',
    product_count: 0,
    lines: lines.map(([p, qty], i) => ({ id: i + 1, part: p, qty })),
  })

  it('부족 · 없음만 보기', () => {
    const list = [part({ id: 1, stock: 3, alert: 5 }), part({ id: 2, stock: 10, alert: 5 }), part({ id: 3, stock: 0 })]
    expect(filterParts(list, { ...NO_FILTER, lowOnly: true }).map((p) => p.id)).toEqual([1, 3])
  })

  it('세트 원가: 가격 없는 포장재는 0원', () => {
    expect(
      setCost(
        pack(1, [
          [1, 2],
          [2, 1],
          [3, 1],
        ]),
        byId,
      ),
    ).toBeCloseTo(35.6 + 440)
  })

  it('바로 쌀 수 있는 수: 가장 모자란 포장재 기준, 0 아래는 0', () => {
    expect(
      canPack(
        pack(1, [
          [1, 2],
          [2, 1],
        ]),
        byId,
      ),
    ).toBe(3) // 봉투 15번, 박스 3번
    expect(canPack(pack(2, [[1, 4]]), byId)).toBe(7)
    expect(canPack(pack(3, [[3, 1]]), byId)).toBe(0)
    expect(canPack(pack(4, []), byId)).toBe(0)
  })

  it('포장재별 쓰는 세트', () => {
    const sets = setsByPart([
      pack(2, [[1, 1]]),
      pack(1, [
        [1, 1],
        [2, 1],
      ]),
    ])
    expect(sets.get(1)?.map((s) => s.id)).toEqual([1, 2])
    expect(sets.get(3)).toBeUndefined()
  })
})
