// 여러 곳에서 같이 쓰는 줄 아이콘 (관리 창 줄 버튼 · 제목 타일). 색은 글자색을 따른다
const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

// 수정 (연필)
export function PencilIcon() {
  return (
    <svg {...svg}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

// 복제 (겹친 네모 두 개)
export function CopyIcon() {
  return (
    <svg {...svg}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}
