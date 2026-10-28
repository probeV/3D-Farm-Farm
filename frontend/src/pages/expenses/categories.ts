// 지출 분류 (EXP-03, 고정 7개). 서버: expenses/models.py ExpenseCategory
// v2: v2 손익 기준에서 어떻게 쓰이는지 (현금 기준은 모두 산 날 지출, docs/plans/v2.md)
import type { ExpenseCategory } from '../../api/expenses'

export interface CategoryInfo {
  key: ExpenseCategory
  label: string
  examples: string
  v2: string
}

export const CATEGORIES: CategoryInfo[] = [
  {
    key: 'invest',
    label: '투자(장비)',
    examples: '프린터 · 필라멘트 건조기 · 라벨 프린터',
    v2: '누적 투자금에 모여요. v2 손익에는 넣지 않고 투자 회수율로 따로 봐요',
  },
  {
    key: 'filament',
    label: '필라멘트',
    examples: '필라멘트 스풀',
    v2: 'v2 손익에서는 이 지출 대신 사용 시작한 스풀 구매가로 계산해요',
  },
  { key: 'part', label: '부자재', examples: '자석 · 박스 · OPP 봉투', v2: 'v2 손익의 재료비 (산 날)' },
  { key: 'supply', label: '소모품 · 유지', examples: '노즐 · 베드 시트 · 윤활유', v2: 'v2 손익의 운영비' },
  { key: 'sub', label: '구독 · 운영', examples: 'AI 구독 · 플랫폼 월정액 · 전기요금', v2: 'v2 손익의 운영비' },
  { key: 'sell', label: '판매비', examples: '택배비 · 광고비', v2: 'v2 손익의 운영비' },
  { key: 'etc', label: '기타', examples: '위에 안 맞는 것', v2: 'v2 손익의 운영비' },
]

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]]

export const categoryInfo = (key: ExpenseCategory) => CATEGORIES.find((c) => c.key === key)!
