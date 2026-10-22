// 엑셀(CSV) 내보내기 (PRD-10): 제품별 원가 내역, UTF-8 BOM (엑셀에서 한글이 깨지지 않게). 검색 · 필터와 상관없이 전체
import type { Category } from '../../../api/products'
import { findSubcategory } from '../categories'
import { STATUS_LABEL } from '../status'
import type { ProductRow } from './productList'

const HEAD = [
  'No.',
  '카테고리',
  '세부 분류',
  '제품명',
  '색상',
  '상태',
  '사용량(g)',
  '출력시간(분)',
  '필라멘트비',
  '전기료',
  '감가상각',
  '실패 보정',
  '부자재비',
  '원가',
  '판매가',
  '수수료',
  '순이익',
  '순마진율(%)',
  '입력 필요',
]

const round = (n: number | null) => (n == null ? '' : Math.round(n))

export function productsCsv(rows: ProductRow[], categories: Category[]) {
  const lines = [...rows]
    .sort((a, b) => a.product.no - b.product.no)
    .map(({ product: p, cost: c, colors }) => [
      p.no,
      categories.find((x) => x.id === p.category)?.name ?? '',
      findSubcategory(categories, p.subcategory)?.name ?? '',
      p.name,
      colors.map((x) => x.name).join(' · '),
      STATUS_LABEL[p.status],
      c.grams,
      p.print_minutes ?? '',
      round(c.filament),
      round(c.electricity),
      round(c.depreciation),
      round(c.failure),
      round(c.parts),
      round(c.cost),
      p.sale_price ?? '',
      round(c.fee),
      round(c.net),
      c.margin == null ? '' : (c.margin * 100).toFixed(1),
      c.warnings.join(' / '),
    ])
  // 모든 칸을 따옴표로 감싸고, 칸 안의 따옴표는 두 번 ("" )
  const csv = [HEAD, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  return '﻿' + csv
}

// 브라우저에서 파일로 내려받기
export function downloadText(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
