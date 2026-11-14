// 다른 화면으로 바로 가기 (주소 이동 없이 App.tsx 의 상태로). 알림의 `라벨 인쇄` 처럼 화면 깊은 곳에서 부른다
import { createContext, useContext } from 'react'

// QR 라벨 인쇄 화면을 열 때 골라 둘 스풀 (TBD-18). 둘 다 없으면 아무것도 안 고름
export interface LabelPick {
  ids?: number[] // 이 스풀들 (재고 추가로 만든 스풀)
  buys?: number[] // 이 구매 항목(지출)의 스풀 중 라벨을 아직 안 뽑은 것 (필라멘트 지출 저장)
  from?: string // 위에 보여 줄 출처 `방금 저장한 지출 PLA Basic 10롤의 스풀`
}

export interface Nav {
  openLabels: (pick?: LabelPick) => void
  openStore: () => void // 판매 › 스마트스토어 연동 (v2 STORE)
}

export const NavContext = createContext<Nav>({ openLabels: () => {}, openStore: () => {} })

export const useNav = () => useContext(NavContext)
