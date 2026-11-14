// 재고 관리 탭 하나의 데이터: 그 탭(kind)의 품목 · 카테고리 + 포장 세트 + 제품(부속품 줄 · 기본 포장)
// 목록 · 관리 창이 같이 쓴다 (같은 쿼리라 한 번만 불러옴). 서버는 전부 주고 탭으로 나누는 건 여기서
import { useMemo } from 'react'
import { usePackSets, usePartCategories, useParts, useProducts, type PartKind } from '../../api/products'
import { usagesByPart } from './partList'

export function usePartsData(kind: PartKind) {
  const parts = useParts()
  const categories = usePartCategories()
  const products = useProducts()
  const packSets = usePackSets()
  const queries = [parts, categories, products, packSets]
  const usages = useMemo(() => products.data && usagesByPart(products.data), [products.data])

  return {
    error: queries.find((q) => q.isError)?.error ?? null,
    retry: () => queries.forEach((q) => q.refetch()),
    data:
      parts.data && categories.data && products.data && packSets.data && usages
        ? {
            kind,
            parts: parts.data.filter((p) => p.kind === kind),
            allParts: parts.data,
            categories: categories.data.filter((c) => c.kind === kind),
            products: products.data,
            packSets: packSets.data,
            usagesOf: (id: number) => usages.get(id) ?? [],
          }
        : null,
  }
}
