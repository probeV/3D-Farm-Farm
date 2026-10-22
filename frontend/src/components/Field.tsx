import type { ReactNode } from 'react'

interface Props {
  label: string
  error?: string // 있으면 빨간 글씨, 없으면 hint
  hint?: ReactNode
  full?: boolean // 두 칸 너비
  children: ReactNode // 입력칸
}

// 폼 입력칸 한 줄: 이름 → 입력칸 → 오류(빨강) 또는 안내(회색). 오류는 항상 칸 아래에 (docs/architecture.md 3.1)
export default function Field({ label, error, hint, full, children }: Props) {
  return (
    <label className={full ? 'field full' : 'field'}>
      <span>{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  )
}
