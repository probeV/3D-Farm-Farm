import { describe, expect, it } from 'vitest'
import type { Expense, RecurringExpense } from '../../api/expenses'
import {
  byCategory,
  dueRecurring,
  expensesCsv,
  filterExpenses,
  NO_FILTER,
  payDate,
  summarize,
  type ListFilter,
} from './expenseList'

const TODAY = '2026-10-28'

let nextId = 1
const expense = (p: Partial<Expense>): Expense => ({
  id: nextId++,
  date: '2026-10-01',
  name: '지출',
  category: 'etc',
  amount: 1000,
  shop: '',
  url: '',
  note: '',
  recurring: null,
  ...p,
})

const recurring = (p: Partial<RecurringExpense>): RecurringExpense => ({
  id: 1,
  name: 'AI 구독',
  category: 'sub',
  amount: 29000,
  day: 5,
  start: '2026-06-01',
  note: '',
  expense_count: 0,
  ...p,
})

const printer = expense({ date: '2026-05-11', name: '3D 프린터', category: 'invest', amount: 1090000, shop: '쿠팡' })
const dryer = expense({ date: '2026-05-20', name: '필라멘트 건조기', category: 'invest', amount: 89000 })
const box = expense({ date: '2025-12-08', name: '소형 박스', category: 'part', amount: 22000, note: '50개' })
const nozzle = expense({ date: '2026-10-16', name: '노즐', category: 'supply', amount: 15000 })
const ai = expense({ date: '2026-10-05', name: 'AI 구독', category: 'sub', amount: 29000, recurring: 1 })
const ALL = [printer, dryer, box, nozzle, ai]

const list = (patch: Partial<ListFilter>) => filterExpenses(ALL, { ...NO_FILTER, ...patch }, TODAY).map((x) => x.name)

describe('filterExpenses', () => {
  it('기본: 최근 날짜순', () => {
    expect(list({})).toEqual(['노즐', 'AI 구독', '필라멘트 건조기', '3D 프린터', '소형 박스'])
  })

  it('기간', () => {
    expect(list({ period: 'month' })).toEqual(['노즐', 'AI 구독'])
    expect(list({ period: 'year' })).toHaveLength(4)
    expect(list({ period: 'custom', from: '2026-05-15', to: '2026-10-10' })).toEqual(['AI 구독', '필라멘트 건조기'])
    expect(list({ period: 'custom', from: '', to: '2026-05-11' })).toEqual(['3D 프린터', '소형 박스'])
  })

  it('분류 · 검색 (항목 · 구매처 · 메모)', () => {
    expect(list({ category: 'invest' })).toEqual(['필라멘트 건조기', '3D 프린터'])
    expect(list({ q: '쿠팡' })).toEqual(['3D 프린터'])
    expect(list({ q: '50개' })).toEqual(['소형 박스'])
  })

  it('열 제목 정렬: 금액 큰 순, 구매처 없는 것은 맨 뒤', () => {
    expect(list({ sort: { key: 'amount', dir: 'desc' } })[0]).toBe('3D 프린터')
    expect(list({ sort: { key: 'shop', dir: 'desc' } })[0]).toBe('3D 프린터')
  })
})

describe('summarize · byCategory', () => {
  it('카드는 기간과 상관없이 전체 · 이번 달', () => {
    expect(summarize(ALL, TODAY)).toEqual({
      invest: 1179000,
      investCount: 2,
      total: 1245000,
      count: 5,
      since: '2025-12-08',
      thisMonth: 44000,
      thisMonthCount: 2,
    })
    expect(summarize([], TODAY).since).toBeNull()
  })

  it('분류별 합계는 7개 분류 모두 (없으면 0)', () => {
    const rows = byCategory(ALL)
    expect(rows.map((c) => c.amount)).toEqual([1179000, 0, 22000, 15000, 29000, 0, 0])
  })
})

describe('반복 지출', () => {
  it('결제일이 말일보다 크면 말일', () => {
    expect(payDate({ day: 31 }, '2026-02')).toBe('2026-02-28')
    expect(payDate({ day: 31 }, '2028-02')).toBe('2028-02-29')
    expect(payDate({ day: 5 }, '2026-10')).toBe('2026-10-05')
  })

  it('넣을 것: 결제일이 지났고 이번 달에 아직 안 넣은 것만', () => {
    const rs = [
      recurring({ id: 1, day: 5 }), // 이번 달 이미 넣음
      recurring({ id: 2, name: '모델링 툴', day: 12 }),
      recurring({ id: 3, name: '보증', day: 30 }), // 결제일 전
      recurring({ id: 4, name: '오늘 결제', day: 28 }), // 오늘이 결제일
      recurring({ id: 5, name: '다음 달 시작', day: 1, start: '2026-11-01' }),
    ]
    expect(dueRecurring(rs, ALL, TODAY).map((r) => r.id)).toEqual([2, 4])
  })
})

describe('expensesCsv', () => {
  it('BOM + 머리 줄 + 분류 이름 + 반복 지출 이름', () => {
    const lines = expensesCsv([ai, box], [recurring({ id: 1 })]).split('\r\n')
    expect(lines[0]).toBe('﻿"날짜","항목","분류","금액","구매처","주문 링크","메모","반복 지출"')
    expect(lines[1]).toBe('"2026-10-05","AI 구독","구독 · 운영","29000","","","","AI 구독"')
    expect(lines[2]).toBe('"2025-12-08","소형 박스","부자재","22000","","","50개",""')
  })
})
