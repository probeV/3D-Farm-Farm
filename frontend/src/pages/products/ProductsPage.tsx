import { useCallback, useState } from 'react'
import type { Product } from '../../api/products'
import Help from '../../components/Help'
import { useToast } from '../../components/useToast'
import { pct, today } from '../../format'
import { selectionExists } from './categories'
import ManageDialog from './catalog/ManageDialog'
import { marginClass } from './cost'
import ProductDialog from './form/ProductDialog'
import { downloadText, productsCsv } from './list/csv'
import ProductTable from './list/ProductTable'
import { filterProducts, NO_FILTER, SORT_COLUMNS, summarize, type ListFilter, type Sort } from './list/productList'
import { nextSort } from '../../sort'
import { useCostData } from './useCostData'

type DialogState = { kind: 'manage' } | { kind: 'product'; productId: number }

// 제품 원가 화면: 상태별 개수 → 요약 카드 → 제품 목록 (docs/screens.md 2장)
export default function ProductsPage() {
  const { error, retry, data } = useCostData()
  const toast = useToast()
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  if (error) {
    return (
      <div className="empty">
        불러오지 못했어요: {error.message}{' '}
        <button className="btn small" onClick={retry}>
          다시 시도
        </button>
      </div>
    )
  }
  if (!data) return <div className="empty">불러오는 중…</div>

  const { rows, categories, catalog } = data
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }))
  // 고른 카테고리가 지워졌으면 전체로
  const category = selectionExists(categories, filter.category, true) ? filter.category : ''
  const list = filterProducts(rows, { ...filter, category })
  const sum = summarize(rows)
  const filtered = filter.q !== '' || category !== '' || filter.needOnly
  const sortBy = (key: Sort['key']) => set({ sort: nextSort(SORT_COLUMNS, filter.sort, key) })

  const exportCsv = () => {
    downloadText(`제품원가_${today()}.csv`, productsCsv(rows, categories))
    toast('CSV 파일을 내려받았어요')
  }

  return (
    <>
      <div className="top-row">
        <div className="stats">
          <span>
            판매중<b>{sum.onSale}</b>
          </span>
          <span>
            개발중<b>{sum.developing}</b>
          </span>
          <span className={sum.discontinued ? 'bad' : ''}>
            판매중지<b>{sum.discontinued}</b>
          </span>
          {/* 입력이 덜 된 제품 수. 누르면 그 제품만 (PRD-02 · PRD-03) */}
          <button
            type="button"
            className={['need', sum.needInput ? '' : 'zero', filter.needOnly ? 'active' : ''].join(' ')}
            disabled={!sum.needInput && !filter.needOnly}
            title={filter.needOnly ? '입력 필요 제품만 보는 중 · 다시 누르면 해제' : '누르면 입력이 덜 된 제품만 보기'}
            onClick={() => set({ needOnly: !filter.needOnly })}
          >
            입력 필요<b>{sum.needInput}</b>
          </button>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog({ kind: 'manage' })}>
          제품 관리
        </button>
      </div>

      <div className="sum-cards two">
        <div className="sum-card">
          <span>등록 제품</span>
          <strong>
            {sum.total}
            <small>개</small>
          </strong>
        </div>
        <div className="sum-card">
          <span>
            평균 순마진율
            <Help tip={`판매중이고 입력이 끝난 제품 ${sum.avgBase}개 기준 · 수수료 반영`} />
          </span>
          <strong className={marginClass(sum.avgMargin)}>{pct(sum.avgMargin)}</strong>
        </div>
      </div>

      <div className="section-head list-toolbar">
        <h3>제품 목록</h3>
        <span className="hint">{list.length}개</span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="제품명·번호·색상 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select value={category} onChange={(e) => set({ category: e.target.value as ListFilter['category'] })}>
          <option value="">카테고리: 전체</option>
          {categories.map((c) => [
            <option key={`c${c.id}`} value={`c:${c.id}`}>
              {c.name}
            </option>,
            ...c.subcategories.map((s) => (
              <option key={`s${s.id}`} value={`s:${s.id}`}>
                {'　'}› {s.name}
              </option>
            )),
          ])}
          {rows.some((r) => r.product.category == null) && <option value="none">미분류</option>}
        </select>
        {filtered && (
          <button className="btn small" onClick={() => set({ q: '', category: '', needOnly: false })}>
            필터 지우기
          </button>
        )}
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          엑셀(CSV) 내보내기
        </button>
      </div>

      {list.length ? (
        <div className="table-wrap">
          <ProductTable
            rows={list}
            categories={categories}
            catalog={catalog}
            sort={filter.sort}
            onSort={sortBy}
            onOpen={(p: Product) => setDialog({ kind: 'product', productId: p.id })}
          />
        </div>
      ) : (
        <div className="empty">
          {rows.length ? '조건에 맞는 제품이 없어요.' : '등록된 제품이 없어요. 제품 관리에서 추가하세요.'}
        </div>
      )}

      {dialog?.kind === 'manage' && <ManageDialog onClose={closeDialog} />}
      {dialog?.kind === 'product' && renderProduct(dialog.productId)}
    </>
  )

  // 제품이 지워졌으면(다른 창에서) 그리지 않는다
  function renderProduct(id: number) {
    const product = rows.find((r) => r.product.id === id)?.product
    return product && <ProductDialog product={product} onClose={closeDialog} />
  }
}
