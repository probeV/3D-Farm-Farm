import { describe, expect, it } from 'vitest'
import type { Part, Product } from '../../api/products'
import { fieldErrors } from '../../validation'
import { filterParts, inShop, NO_FILTER, shopsOf, summarize, usagesByPart } from './partList'
import { partSchema, previewUnitPrice } from './schemas'

const part = (p: Partial<Part>): Part => ({
  id: 1,
  name: '',
  shop: '',
  price: 1000,
  pack_qty: 10,
  unit: '개',
  unit_price: 100,
  note: '',
  product_count: 0,
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

  it('평균 부자재비는 판매중이고 부자재를 쓰는 제품만 (가격 미입력은 0원)', () => {
    // 분수 원판 = 15 × 60 + 1 × 17.8 = 917.8, 무드등 = 440 → 평균 678.9
    expect(summarize(parts, products)).toEqual({
      total: 4,
      used: 3,
      unused: 1,
      noPrice: 1,
      avgPartsCost: 678.9,
      avgBase: 2,
    })
    expect(summarize(parts, []).avgPartsCost).toBeNull()
  })

  it('관리 창 구매처 목록 · 선택', () => {
    expect(shopsOf(parts)).toEqual(['알리', '쿠팡'])
    expect(parts.filter((p) => inShop(p, 's:쿠팡')).map((p) => p.id)).toEqual([2, 4])
    expect(parts.filter((p) => inShop(p, 'none')).map((p) => p.id)).toEqual([3])
    expect(parts.filter((p) => inShop(p, '')).length).toBe(4)
  })
})

describe('부자재 폼 검증 (PART-02)', () => {
  const values = { name: ' 자석 ', shop: '', price: '12,000', pack_qty: '200', unit: '', note: '' }

  it('글자 → 서버로 보낼 값 (단위를 비우면 "개", 구매가를 비우면 미입력)', () => {
    expect(partSchema.parse(values)).toEqual({
      name: '자석',
      shop: '',
      price: 12000,
      pack_qty: 200,
      unit: '개',
      note: '',
    })
    expect(partSchema.parse({ ...values, price: '' }).price).toBeNull()
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
