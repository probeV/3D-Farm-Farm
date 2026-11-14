// 지출 분류 (EXP-03, 고정 9개). 서버: expenses/models.py ExpenseCategory
// v2: 재고 관리 탭과 같은 단위로 나눔 (부속품 · 포장재 · 소모품). 손익 기준에서 장비는 투자 회수로,
// 필라멘트는 사용 시작한 스풀로, 세금은 영업이익 다음에(PL-06), 나머지는 산 날 (docs/plans/v2.md "돈을 보는 두 관점")
import type { ExpenseCategory } from '../../api/expenses'

export interface CategoryInfo {
  key: ExpenseCategory
  label: string
  examples: string
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'invest', label: '장비', examples: '프린터 · 필라멘트 건조기 · 라벨 프린터' },
  { key: 'filament', label: '필라멘트', examples: '필라멘트 스풀' },
  { key: 'part', label: '부속품', examples: '자석 · 볼트 · LED 모듈' },
  { key: 'pack', label: '포장재', examples: '박스 · OPP 봉투 · 완충재' },
  { key: 'supply', label: '소모품', examples: '접착제 · 노즐 · 베드 시트 · 윤활유' },
  { key: 'sub', label: '구독 · 운영', examples: 'AI 구독 · 플랫폼 월정액 · 전기요금' },
  { key: 'sell', label: '판매비', examples: '택배비 · 광고비' },
  { key: 'tax', label: '세금', examples: '종합소득세 · 지방소득세' },
  { key: 'etc', label: '기타', examples: '위에 안 맞는 것' },
]

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]]

export const categoryInfo = (key: ExpenseCategory) => CATEGORIES.find((c) => c.key === key)!
