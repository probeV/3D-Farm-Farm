import type { ReactNode } from 'react'
import type { SortState } from '../sort'

interface Props<K extends string> {
  sortKey: K
  sort: SortState<K>
  onSort: (key: K) => void
  num?: boolean // 숫자 열 (오른쪽 정렬)
  children: ReactNode
}

// 눌러서 정렬하는 열 제목. 정렬된 열은 파란 글자 + ▲(오름차순) / ▼(내림차순)
export default function SortTh<K extends string>({ sortKey, sort, onSort, num, children }: Props<K>) {
  const on = sort.key === sortKey
  return (
    <th
      className={['sortable', num && 'num', on && 'sorted'].filter(Boolean).join(' ')}
      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => onSort(sortKey)}>
        {children}
        <span className="arrow">{on && sort.dir === 'desc' ? '▼' : '▲'}</span>
      </button>
    </th>
  )
}
