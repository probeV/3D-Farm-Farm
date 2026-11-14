import { describe, expect, it } from 'vitest'
import type { Filament } from '../../../api/filaments'
import type { Product } from '../../../api/products'
import { fieldErrors } from '../../../validation'
import { categorySchema } from '../catalog/schemas'
import { initialValues, previewOf, type Values } from './draft'
import { productSchema } from './schemas'

const values = (v: Partial<Values> = {}): Values => ({
  name: ' 소마 큐브 ',
  category: '1',
  subcategory: '',
  status: 'on_sale',
  hours: '2',
  minutes: '45',
  sale_price: '12,900',
  default_pack: '',
  note: '',
  filaments: [{ key: 1, filament: '4', color: '7', grams: '50.5' }],
  parts: [{ key: 2, part: '3', qty: '' }],
  ...v,
})

describe('제품 폼 검증 (PRD-04 · PRD-05 · PRD-06)', () => {
  it('글자 → 서버로 보낼 값 (출력 시간은 시 + 분 → 분)', () => {
    expect(productSchema.safeParse(values())).toMatchObject({
      success: true,
      data: {
        name: '소마 큐브',
        category: 1,
        subcategory: null,
        status: 'on_sale',
        print_minutes: 165,
        sale_price: 12900,
        filaments: [{ filament: 4, color: 7, grams: 50.5 }],
        parts: [{ part: 3, qty: 0 }], // 비운 수량은 0
      },
    })
  })

  it('비운 칸: 출력 시간 · 판매가는 미입력(null), 색상은 선택 안 함', () => {
    const r = productSchema.safeParse(
      values({
        hours: '',
        minutes: '',
        sale_price: '',
        filaments: [{ key: 1, filament: '4', color: '', grams: '' }],
      }),
    )
    expect(r).toMatchObject({
      success: true,
      data: { print_minutes: null, sale_price: null, filaments: [{ color: null, grams: 0 }] },
    })
  })

  it('분만 넣어도 된다', () => {
    expect(productSchema.safeParse(values({ hours: '', minutes: '30' }))).toMatchObject({ data: { print_minutes: 30 } })
  })

  it('틀린 칸은 칸 이름으로, 줄 안의 칸은 "목록.순서.칸" 으로', () => {
    const r = productSchema.safeParse(
      values({
        name: '',
        minutes: '60',
        filaments: [
          { key: 1, filament: '4', color: '', grams: '10' },
          { key: 2, filament: '4', color: '', grams: '1.255' },
        ],
      }),
    )
    expect(r.success).toBe(false)
    if (!r.success)
      expect(fieldErrors(r.error)).toEqual({
        name: '입력하세요',
        minutes: '59 이하로 입력하세요',
        'filaments.1.grams': '소수 2자리까지 입력하세요',
      })
  })
})

describe('카테고리 폼 검증 (PRD-11)', () => {
  it('새 줄을 비우면 버리고, 이름이 겹치면 그 줄에 오류', () => {
    expect(
      categorySchema.safeParse({
        name: '퍼즐',
        subs: [
          { id: 1, name: '입체' },
          { id: null, name: '  ' },
        ],
      }),
    ).toMatchObject({ success: true, data: { subs: [{ id: 1, name: '입체' }] } })

    const r = categorySchema.safeParse({
      name: '퍼즐',
      subs: [
        { id: 1, name: '입체' },
        { id: 2, name: '' },
        { id: null, name: '입체' },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(fieldErrors(r.error)).toEqual({ 'subs.1.name': '이름을 입력하세요', 'subs.2.name': '이름이 겹쳐요' })
  })
})

describe('제품 창 처음 값 (PRD-04 · PRD-04a)', () => {
  const filaments = [{ id: 4 }] as Filament[]
  const src: Product = {
    id: 9,
    category: 1,
    subcategory: 2,
    name: '하노이 탑',
    status: 'on_sale',
    print_minutes: 125,
    sale_price: 5500,
    default_pack: null,
    note: '메모',
    filaments: [{ id: 1, filament: 4, color: 7, grams: 120 }],
    parts: [{ id: 1, part: 3, qty: 1 }],
    created_at: '',
    updated_at: '',
  }

  it('수정: 저장된 값 그대로', () => {
    expect(initialValues({ product: src }, filaments)).toMatchObject({
      name: '하노이 탑',
      hours: '2',
      minutes: '5',
      filaments: [{ filament: '4', color: '7', grams: '120' }],
    })
  })

  it('복제: 재료까지 복사, 이름 (복사), 상태 개발중', () => {
    expect(initialValues({ product: null, copyOf: src }, filaments)).toMatchObject({
      name: '하노이 탑 (복사)',
      status: 'developing',
      category: '1',
      parts: [{ part: '3', qty: '1' }],
    })
  })

  it('추가: 고른 카테고리 · 세부 분류, 첫 필라멘트 한 줄', () => {
    expect(initialValues({ product: null, preset: { category: 1, subcategory: 2 } }, filaments)).toMatchObject({
      category: '1',
      subcategory: '2',
      status: 'developing',
      filaments: [{ filament: '4', color: '', grams: '' }],
      parts: [],
    })
  })

  it('미리보기: 틀린 글자는 비운 것으로 계산', () => {
    expect(previewOf(values({ hours: 'x', minutes: '30', sale_price: '1,000' }))).toMatchObject({
      print_minutes: 30,
      sale_price: 1000,
      filaments: [{ filament: 4, color: 7, grams: 50.5 }],
      parts: [{ part: 3, qty: 0 }],
    })
  })
})
