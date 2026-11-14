import { createContext, useContext } from 'react'

// 되돌리기: 방금 한 동작의 반대 요청 (PRD 3.5)
export type Undo = () => Promise<unknown>

// 알림 오른쪽 바로가기 버튼 (예: `라벨 인쇄` → QR 화면, TBD-18)
export interface ToastAction {
  label: string
  run: () => void
}

// toast('저장했어요') / toast('3개 추가했어요', 되돌리기) / toast('저장했어요', undefined, { label: '라벨 인쇄', run })
export type ShowToast = (message: string, undo?: Undo, action?: ToastAction) => void

export const ToastContext = createContext<ShowToast>(() => {})

export const useToast = () => useContext(ToastContext)

// 열린 모달 대화상자 등록 (Dialog 가 열릴 때 부르고, 돌려받은 함수를 닫힐 때 부른다).
// 모달이 열려 있으면 그 바깥은 클릭할 수 없어서(inert), 알림을 가장 위 대화상자 안에 그려야 `되돌리기` 를 누를 수 있다
export const ToastLayerContext = createContext<(dialog: HTMLElement) => () => void>(() => () => {})
