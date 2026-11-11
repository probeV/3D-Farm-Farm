import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  count?: number
  addLabel?: string // 예: + 회사 추가
  onAdd?: () => void
  className?: string
  children: ReactNode
}

// 관리 창의 목록 한 칸 (docs/screens.md 공통 "관리 창"). 제목 줄(제목 · 개수 · 추가 버튼)은 그대로 두고 목록만 따로 스크롤
export default function ManageColumn({ title, count, addLabel, onAdd, className, children }: Props) {
  return (
    <div className={className ? `manage-col ${className}` : 'manage-col'}>
      <div className="col-head">
        <h4>{title}</h4>
        {count != null && <span className="count">{count}</span>}
        <div className="spacer" />
        {addLabel && (
          <button type="button" className="btn small add" onClick={onAdd}>
            {addLabel}
          </button>
        )}
      </div>
      <div className="col-scroll">{children}</div>
    </div>
  )
}
