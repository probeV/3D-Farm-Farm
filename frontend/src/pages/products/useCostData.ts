// 제품 원가 화면 데이터: 제품 · 카테고리 · 필라멘트 · 재고 품목(+ 카테고리) · 포장 세트 · 설정을 함께 불러와 제품별 원가까지 계산해 둔다
// 목록 · 제품 관리 창 · 제품 창이 같이 쓴다 (같은 쿼리라 한 번만 불러옴)
import { useMemo } from 'react'
import { useFilaments } from '../../api/filaments'
import {
  useCategories,
  useCostSetting,
  usePackSets,
  usePartCategories,
  useParts,
  useProducts,
} from '../../api/products'
import { calcCost, makeCatalog, productColors } from './cost'
import type { ProductRow } from './list/productList'

export function useCostData() {
  const products = useProducts()
  const categories = useCategories()
  const filaments = useFilaments()
  const parts = useParts()
  const partCategories = usePartCategories()
  const setting = useCostSetting()
  const packSets = usePackSets()
  const queries = [products, categories, filaments, parts, partCategories, setting, packSets]

  const catalog = useMemo(
    () =>
      filaments.data &&
      parts.data &&
      setting.data &&
      packSets.data &&
      makeCatalog(filaments.data, parts.data, setting.data, packSets.data),
    [filaments.data, parts.data, setting.data, packSets.data],
  )
  const rows = useMemo<ProductRow[] | undefined>(
    () =>
      catalog &&
      products.data?.map((product) => ({
        product,
        cost: calcCost(product, catalog),
        colors: productColors(product, catalog),
      })),
    [catalog, products.data],
  )

  return {
    error: queries.find((q) => q.isError)?.error ?? null,
    retry: () => queries.forEach((q) => q.refetch()),
    data:
      catalog && rows && categories.data && filaments.data && parts.data && partCategories.data
        ? {
            catalog,
            rows,
            categories: categories.data,
            filaments: filaments.data,
            parts: parts.data,
            partCategories: partCategories.data,
            packSets: packSets.data!, // catalog 이 있으면 있음
          }
        : null,
  }
}

export type CostData = NonNullable<ReturnType<typeof useCostData>['data']>
