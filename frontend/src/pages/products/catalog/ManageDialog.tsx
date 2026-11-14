import { useState } from 'react'
import type { Category, Product } from '../../../api/products'
import Dialog from '../../../components/Dialog'
import ManageColumn from '../../../components/ManageColumn'
import { pct, won } from '../../../format'
import { findSubcategory, inSelection, selectionExists, selectionLabel, type CategorySel } from '../categories'
import { completeMargin, marginClass } from '../cost'
import ProductDialog from '../form/ProductDialog'
import type { ProductRow } from '../list/productList'
import StatusBadge from '../StatusBadge'
import { useCostData } from '../useCostData'
import CategoryDialog from './CategoryDialog'
import EditButton, { CopyButton } from '../../../components/EditButton'

// 관리 창 위에 겹쳐 여는 창
type Sub =
  | { kind: 'category'; category: Category | null } // null = 추가
  | { kind: 'product'; product: Product | null; copyOf?: Product }

// 제품 관리 (PRD-04 · PRD-04a · PRD-11, docs/screens.md 2.4)
// 왼쪽: 카테고리 › 세부 분류 (+ 미분류) / 오른쪽: 고른 것의 제품 (처음엔 전체). 고른 것을 다시 누르면 전체로
// 제품 추가 · 복제는 여기서, 삭제는 제품 수정 창에서
export default function ManageDialog({ onClose }: { onClose: () => void }) {
  const data = useCostData().data

  const [picked, setPicked] = useState<CategorySel>('')
  const [sub, setSub] = useState<Sub | null>(null)
  const closeSub = () => setSub(null)
  if (!data) return null

  const { rows, categories } = data
  const hasUncategorized = rows.some((r) => r.product.category == null)
  // 고른 것이 지워졌으면 전체로
  const sel: CategorySel = selectionExists(categories, picked, hasUncategorized) ? picked : ''
  const count = (s: CategorySel) => rows.filter((r) => inSelection(r.product, s)).length
  const prods = rows.filter((r) => inSelection(r.product, sel)).sort((a, b) => a.product.id - b.product.id)

  // `+ 제품 추가`: 지금 고른 카테고리 · 세부 분류를 미리 고른 채로
  const preset = () => {
    if (sel === '' || sel === 'none') return { category: null, subcategory: null }
    const id = Number(sel.slice(2))
    if (sel.startsWith('c:')) return { category: id, subcategory: null }
    return { category: findSubcategory(categories, id)?.category ?? null, subcategory: id }
  }

  const productRow = ({ product: p, cost }: ProductRow) => {
    const margin = completeMargin(cost)
    return (
      <div key={p.id} className="row-item">
        <div>
          <strong>{p.name}</strong>
          <StatusBadge status={p.status} />
        </div>
        <div className="price">
          {won(p.sale_price)}
          <div className={cost.warnings.length ? 'muted' : marginClass(margin)}>
            {cost.warnings.length ? '입력 필요' : pct(margin)}
          </div>
        </div>
        <div className="row-btns">
          <CopyButton onClick={() => setSub({ kind: 'product', product: null, copyOf: p })} />
          <EditButton onClick={() => setSub({ kind: 'product', product: p })} />
        </div>
      </div>
    )
  }

  // 전체면 카테고리별로, 카테고리를 고르면 세부 분류별로 묶어서 (분류 없는 제품은 끝에)
  const right = () => {
    if (!prods.length) return <p className="hint">등록된 제품이 없어요.</p>
    let groups: [string, ProductRow[]][]
    if (sel === '') {
      groups = [
        ...categories.map((c): [string, ProductRow[]] => [c.name, prods.filter((r) => r.product.category === c.id)]),
        ['미분류', prods.filter((r) => r.product.category == null)],
      ]
    } else {
      const subs = sel.startsWith('c:')
        ? (categories.find((c) => c.id === Number(sel.slice(2)))?.subcategories ?? [])
        : []
      if (!subs.length) return prods.map(productRow)
      groups = [
        ...subs.map((s): [string, ProductRow[]] => [s.name, prods.filter((r) => r.product.subcategory === s.id)]),
        ['세부 분류 없음', prods.filter((r) => r.product.subcategory == null)],
      ]
    }
    return groups
      .filter(([, list]) => list.length)
      .map(([name, list]) => (
        <div key={name}>
          <div className="group-label">{name}</div>
          {list.map(productRow)}
        </div>
      ))
  }

  const item = (s: CategorySel, label: string, opts: { sub?: boolean; extra?: string; category?: Category } = {}) => (
    <div
      key={s}
      className={[
        'list-item',
        opts.sub ? 'sub' : '',
        s === sel ? 'active' : '',
        s === 'none' ? 'uncategorized' : '',
        opts.category ? 'cat-item' : '',
      ].join(' ')}
      // 고른 것을 다시 누르면 선택을 풀고 전체로
      onClick={() => setPicked(s === sel ? '' : s)}
    >
      <div className="grow">
        <strong>{label}</strong>
        {!opts.sub && (
          <small>
            제품 {count(s)}개{opts.extra}
          </small>
        )}
      </div>
      {opts.sub && <small className="sub-count">{count(s)}</small>}
      {opts.category && (
        <EditButton
          onClick={(e) => {
            e.stopPropagation() // 카테고리 선택까지 같이 되지 않도록
            setSub({ kind: 'category', category: opts.category! })
          }}
        />
      )}
    </div>
  )

  return (
    <>
      <Dialog size="wide" fixed title="제품 관리" onClose={onClose}>
        <div className="manage">
          <ManageColumn
            title="카테고리"
            count={categories.length}
            addLabel="+ 카테고리 추가"
            onAdd={() => setSub({ kind: 'category', category: null })}
          >
            {/* 카테고리마다 한 묶음: 카테고리 줄 아래에 세부 분류를 세로선으로 들여 쓴다. 묶음 사이는 구분선 */}
            <div className="list cat-list">
              {categories.map((c) => (
                <div key={c.id} className="cat-group">
                  {item(`c:${c.id}`, c.name, {
                    category: c,
                    extra: c.subcategories.length ? ` · 세부 ${c.subcategories.length}` : '',
                  })}
                  {c.subcategories.length > 0 && (
                    <div className="sub-list">
                      {c.subcategories.map((s) => item(`s:${s.id}`, s.name, { sub: true }))}
                    </div>
                  )}
                </div>
              ))}
              {hasUncategorized && <div className="cat-group">{item('none', '미분류')}</div>}
            </div>
          </ManageColumn>
          <ManageColumn
            className="manage-right"
            title={sel === '' ? '전체 제품' : `${selectionLabel(categories, sel)} 의 제품`}
            count={prods.length}
            addLabel="+ 제품 추가"
            onAdd={() => setSub({ kind: 'product', product: null })}
          >
            {right()}
          </ManageColumn>
        </div>
      </Dialog>

      {/* 겹쳐 여는 창은 관리 창 안이 아니라 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {sub?.kind === 'category' && (
        <CategoryDialog category={sub.category} onClose={closeSub} onSaved={(c) => setPicked(`c:${c.id}`)} />
      )}
      {sub?.kind === 'product' && (
        <ProductDialog
          product={sub.product}
          copyOf={sub.copyOf}
          preset={sub.product || sub.copyOf ? undefined : preset()}
          onClose={closeSub}
        />
      )}
    </>
  )
}
