// 목록의 열 제목 정렬 (TBD-05, docs/screens.md 공통 "열 제목 정렬")
// 열 제목을 누르면 그 열로 정렬, 한 번 더 누르면 반대 방향
export type SortDir = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  dir: SortDir
}

// 열 하나의 정렬 기준. 값이 null 이면 (입력이 덜 됨 · 비어 있음) 방향과 상관없이 맨 뒤
export interface SortColumn<T> {
  value: (row: T) => number | string | null
  first?: SortDir // 처음 눌렀을 때 방향 (기본 오름차순. 금액 · 개수처럼 큰 것부터 보는 열은 desc)
}

export type SortColumns<T, K extends string> = Record<K, SortColumn<T>>

export function nextSort<T, K extends string>(columns: SortColumns<T, K>, cur: SortState<K>, key: K): SortState<K> {
  if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: columns[key].first ?? 'asc' }
}

// 값이 같으면 tie (예: No. 순 · 이름순) 로
export function compareBy<T, K extends string>(
  columns: SortColumns<T, K>,
  sort: SortState<K>,
  tie: (a: T, b: T) => number,
) {
  const { value } = columns[sort.key]
  const sign = sort.dir === 'asc' ? 1 : -1
  return (a: T, b: T) => {
    const x = value(a)
    const y = value(b)
    if (x == null || y == null) return Number(x == null) - Number(y == null) || tie(a, b)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'ko') : Number(x) - Number(y)
    return sign * c || tie(a, b)
  }
}
