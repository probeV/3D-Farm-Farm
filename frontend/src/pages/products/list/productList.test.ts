import { describe, expect, it } from 'vitest'
import type { Color } from '../../../api/filaments'
import type { Category, Product } from '../../../api/products'
import type { Cost } from '../cost'
import { productsCsv } from './csv'
import { filterProducts, NO_FILTER, summarize, type ProductRow } from './productList'

const cost = (c: Partial<Cost> = {}): Cost => ({
  grams: 10,
  filament: 100,
  electricity: 0,
  parts: 0,
  pack: 0,
  cost: 100,
  feeRate: 0,
  fee: 0,
  net: 900,
  margin: 0.9,
  recommended: 200,
  warnings: [],
  packWarnings: [],
  ...c,
})

const product = (p: Partial<Product>): Product => ({
  id: 1,
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

const red = { id: 1, name: '레드', hex: '#FF0000' } as Color

const rows: ProductRow[] = [
  { product: product({ id: 10, name: '하노이 탑', category: 2 }), cost: cost({ margin: 0.1, cost: 300 }), colors: [] },
  {
    product: product({ id: 2, name: '소마 큐브', category: 1, subcategory: 5 }),
    cost: cost({ margin: 0.5 }),
    colors: [red],
  },
  {
    product: product({ id: 3, name: '도형 칠교', status: 'developing' }),
    cost: cost({ margin: 0.9, warnings: ['출력 시간 미입력'] }),
    colors: [],
  },
  {
    product: product({ id: 1, name: '분수 원판', status: 'discontinued', category: 1 }),
    cost: cost({ margin: -0.2 }),
    colors: [],
  },
]

const ids = (list: ProductRow[]) => list.map((r) => r.product.id)

describe('제품 목록 검색 · 필터 · 정렬 (PRD-01b · PRD-03)', () => {
  it('기본은 추가한 순서 (id)', () => {
    expect(ids(filterProducts(rows, NO_FILTER))).toEqual([1, 2, 3, 10])
  })

  it('검색: 제품명 · 색상 이름 (번호로는 찾지 않음)', () => {
    expect(ids(filterProducts(rows, { ...NO_FILTER, q: '큐브' }))).toEqual([2])
    expect(ids(filterProducts(rows, { ...NO_FILTER, q: '10' }))).toEqual([])
    expect(ids(filterProducts(rows, { ...NO_FILTER, q: '레드' }))).toEqual([2])
  })

  it('카테고리 · 세부 분류 · 미분류 필터', () => {
    expect(ids(filterProducts(rows, { ...NO_FILTER, category: 'c:1' }))).toEqual([1, 2])
    expect(ids(filterProducts(rows, { ...NO_FILTER, category: 's:5' }))).toEqual([2])
    expect(ids(filterProducts(rows, { ...NO_FILTER, category: 'none' }))).toEqual([3])
  })

  it('입력 필요 제품만', () => {
    expect(ids(filterProducts(rows, { ...NO_FILTER, needOnly: true }))).toEqual([3])
  })

  it('순마진율 정렬: 입력이 덜 된 제품은 방향과 상관없이 맨 뒤', () => {
    expect(ids(filterProducts(rows, { ...NO_FILTER, sort: { key: 'margin', dir: 'asc' } }))).toEqual([1, 10, 2, 3])
    expect(ids(filterProducts(rows, { ...NO_FILTER, sort: { key: 'margin', dir: 'desc' } }))).toEqual([2, 10, 1, 3])
  })

  it('이름순 · 원가 높은 순 (같으면 추가한 순서)', () => {
    expect(ids(filterProducts(rows, { ...NO_FILTER, sort: { key: 'name', dir: 'asc' } }))).toEqual([3, 1, 2, 10])
    expect(ids(filterProducts(rows, { ...NO_FILTER, sort: { key: 'cost', dir: 'desc' } }))).toEqual([10, 1, 2, 3])
  })

  it('상태 제품만', () => {
    const status = rows.find((r) => r.product.id === 2)!.product.status
    const want = rows.filter((r) => r.product.status === status).map((r) => r.product.id)
    expect(ids(filterProducts(rows, { ...NO_FILTER, status }))).toEqual([...want].sort((a, b) => a - b))
  })
})

describe('요약 (PRD-02)', () => {
  it('상태별 개수 · 평균 순마진율은 판매중이고 입력이 끝난 제품만', () => {
    expect(summarize(rows)).toEqual({
      byStatus: { on_sale: 2, developing: 1, discontinued: 1 },
      total: 4,
      avgMargin: (0.1 + 0.5) / 2,
      avgBase: 2,
      needInput: 1,
    })
  })

  it('제품이 없으면 평균은 없음', () => {
    expect(summarize([]).avgMargin).toBeNull()
  })
})

describe('CSV (PRD-10)', () => {
  const categories: Category[] = [
    {
      id: 1,
      name: '퍼즐',
      product_count: 2,
      subcategories: [{ id: 5, category: 1, name: '입체 "퍼즐"', product_count: 1 }],
    },
  ]

  it('UTF-8 BOM + 제목 줄, 추가한 순서, 따옴표는 두 번', () => {
    const lines = productsCsv(rows, categories).split('\r\n')
    expect(lines[0].startsWith('﻿"카테고리","세부 분류","제품명"')).toBe(true)
    expect(lines).toHaveLength(5)
    expect(lines[1].startsWith('"퍼즐","","분수 원판","","판매중지"')).toBe(true)
    expect(lines[2]).toContain('"퍼즐","입체 ""퍼즐""","소마 큐브","레드","판매중"')
    expect(lines[3]).toContain('"출력 시간 미입력"')
  })
})
