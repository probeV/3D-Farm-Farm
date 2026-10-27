import { createContext, useContext, type ReactNode } from 'react'

// 함께 지워지거나 바뀌는 것 하나 (예: 제목 `스풀 5개도 함께 삭제`, 내용 `재고 2 · 사용 중 1 · 사용 완료 2`)
export interface ConfirmEffect {
  title: ReactNode
  details?: ReactNode[]
  tone?: 'warn' // 지워지지는 않고 바뀌는 것 (주황). 기본은 삭제 창이면 빨강
}

export interface ConfirmOptions {
  title: string // 창 제목 (예: 색상 삭제)
  message: ReactNode // 묻는 말 (예: 레드 색상을 삭제할까요?)
  effects?: ConfirmEffect[]
  danger?: boolean // 삭제: 빨간 버튼. 아니면 파란 버튼 (스풀 되돌리기 등)
  twice?: boolean // 2차 확인: 누르면 같은 창에서 `정말 삭제` 로 바뀌고 한 번 더 눌러야 실행 (다른 데이터도 바뀌는 삭제)
  okLabel?: string // 기본 `삭제`
  againLabel?: string // 2차 확인 버튼. 기본 `정말 삭제`
}

// if (!(await confirm({ title: '부자재 삭제', message: '…을(를) 삭제할까요?', danger: true }))) return
export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm>(async () => false)

export const useConfirm = () => useContext(ConfirmContext)
