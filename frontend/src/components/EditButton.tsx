import type { MouseEvent } from 'react'

// 관리 창 줄의 `수정` 연필 아이콘 (v1.2.0). 글자 버튼보다 줄이 덜 붐비고, 옆의 ✕(삭제)와 모양을 맞춘다
export default function EditButton({ onClick, title = '수정' }: { onClick: (e: MouseEvent) => void; title?: string }) {
  return (
    <button type="button" className="icon-btn edit" title={title} aria-label={title} onClick={onClick}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  )
}
