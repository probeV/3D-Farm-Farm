import type { MouseEvent } from 'react'
import { CopyIcon, PencilIcon } from './icons'

interface Props {
  onClick: (e: MouseEvent) => void
  title?: string
}

// 관리 창 줄의 `수정` 연필 아이콘 (v1.2.0). 글자 버튼보다 줄이 덜 붐비고, 옆의 ✕(삭제)와 모양을 맞춘다
export default function EditButton({ onClick, title = '수정' }: Props) {
  return (
    <button type="button" className="icon-btn edit" title={title} aria-label={title} onClick={onClick}>
      <PencilIcon />
    </button>
  )
}

// 관리 창 줄의 `복제` 아이콘 (v1.2.0). 수정 · 삭제 아이콘과 같은 크기
export function CopyButton({ onClick, title = '복제' }: Props) {
  return (
    <button type="button" className="icon-btn edit" title={title} aria-label={title} onClick={onClick}>
      <CopyIcon />
    </button>
  )
}
