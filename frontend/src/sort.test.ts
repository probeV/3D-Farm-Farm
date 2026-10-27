import { describe, expect, it } from 'vitest'
import { compareBy, nextSort, type SortColumns } from './sort'

interface Row {
  name: string
  price: number | null
}

const columns: SortColumns<Row, 'name' | 'price'> = {
  name: { value: (r) => r.name },
  price: { value: (r) => r.price, first: 'desc' },
}
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, 'ko')
const rows: Row[] = [
  { name: '나', price: 300 },
  { name: '가', price: null },
  { name: '다', price: 100 },
  { name: '라', price: 300 },
]
const names = (sorted: Row[]) => sorted.map((r) => r.name)

describe('열 제목 정렬 (TBD-05)', () => {
  it('다른 열을 누르면 그 열의 처음 방향, 같은 열을 다시 누르면 반대 방향', () => {
    expect(nextSort(columns, { key: 'name', dir: 'asc' }, 'price')).toEqual({ key: 'price', dir: 'desc' })
    expect(nextSort(columns, { key: 'price', dir: 'desc' }, 'price')).toEqual({ key: 'price', dir: 'asc' })
    expect(nextSort(columns, { key: 'price', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
  })

  it('값이 없으면 방향과 상관없이 맨 뒤, 같으면 tie 순서', () => {
    expect(names([...rows].sort(compareBy(columns, { key: 'price', dir: 'desc' }, byName)))).toEqual([
      '나',
      '라',
      '다',
      '가',
    ])
    expect(names([...rows].sort(compareBy(columns, { key: 'price', dir: 'asc' }, byName)))).toEqual([
      '다',
      '나',
      '라',
      '가',
    ])
  })

  it('글자는 한글 순서', () => {
    expect(names([...rows].sort(compareBy(columns, { key: 'name', dir: 'desc' }, byName)))).toEqual([
      '라',
      '다',
      '나',
      '가',
    ])
  })
})
