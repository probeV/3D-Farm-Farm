import { useState } from 'react'
import { deletePart, useRefreshProducts, type Part, type PartCategory } from '../../api/products'
import Dialog from '../../components/Dialog'
import ManageColumn from '../../components/ManageColumn'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { unitWon } from '../../format'
import BuyLink from './BuyLink'
import PartCategoryDialog from './PartCategoryDialog'
import PartDialog from './PartDialog'
import { inCategory, inShop, shopsOf, type CategorySel, type ShopSel } from './partList'
import { usePartsData } from './usePartsData'

// 관리 창 위에 겹쳐 여는 창
type Sub = { kind: 'part'; part: Part | null; copyOf?: Part } | { kind: 'category'; category: PartCategory | null }
type View = 'shop' | 'category'

// 부자재 관리 (PART-02 · PART-02a, docs/screens.md 3.4)
// 제목 줄 오른쪽에서 구매처별 / 카테고리별. 왼쪽: 전체 + 구매처(+ 구매처 없음) 또는 카테고리(+ 미분류, 추가 · 수정)
// 오른쪽: 고른 것의 부자재. 부자재 추가 · 복제 · 삭제는 여기서
export default function ManageDialog({ onClose }: { onClose: () => void }) {
  const data = usePartsData().data
  const refresh = useRefreshProducts()
  const toast = useToast()

  const confirm = useConfirm()
  const [view, setView] = useState<View>('shop')
  const [picked, setPicked] = useState<ShopSel>('')
  const [pickedCategory, setPickedCategory] = useState<CategorySel>('')
  const [sub, setSub] = useState<Sub | null>(null)
  const closeSub = () => setSub(null)
  if (!data) return null

  const { parts, categories, usagesOf } = data
  const shops = shopsOf(parts)
  const hasNoShop = parts.some((p) => !p.shop)
  const hasUncategorized = parts.some((p) => p.category == null)
  // 고른 구매처의 부자재가 모두 없어졌으면(구매처를 바꾸거나 삭제) 전체로
  const sel: ShopSel = picked === 'none' ? (hasNoShop ? picked : '') : shops.includes(picked.slice(2)) ? picked : ''
  // 고른 카테고리가 지워졌으면 전체로
  const catSel: CategorySel =
    pickedCategory === 'none'
      ? hasUncategorized
        ? pickedCategory
        : ''
      : categories.some((c) => `c:${c.id}` === pickedCategory)
        ? pickedCategory
        : ''
  const inView = (p: Part) => (view === 'shop' ? inShop(p, sel) : inCategory(p, catSel))
  const list = parts.filter(inView).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name
  const selName =
    view === 'shop'
      ? sel === ''
        ? ''
        : sel === 'none'
          ? '구매처 없음'
          : sel.slice(2)
      : catSel === ''
        ? ''
        : catSel === 'none'
          ? '미분류'
          : (categoryName(Number(catSel.slice(2))) ?? '')

  const remove = async (p: Part) => {
    // 제품에서 쓰면 서버도 막는다 (409)
    if (p.product_count) return toast(`제품 ${p.product_count}개에서 쓰고 있어서 삭제할 수 없어요`)
    if (!(await confirm({ title: '부자재 삭제', message: `${p.name} 을(를) 삭제할까요?`, danger: true }))) return
    try {
      await deletePart(p.id)
      await refresh()
      toast(`${p.name} 삭제했어요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const categoryItem = (s: CategorySel, label: string, category?: PartCategory) => (
    <div
      key={s}
      className={['list-item', s === catSel ? 'active' : '', s === 'none' ? 'no-shop' : ''].join(' ')}
      onClick={() => setPickedCategory(s)}
    >
      <div className="grow">
        <strong>{label}</strong>
        <small>부자재 {parts.filter((p) => inCategory(p, s)).length}개</small>
      </div>
      {category && (
        <button
          type="button"
          className="btn small"
          onClick={(e) => {
            e.stopPropagation() // 카테고리 선택까지 같이 되지 않도록
            setSub({ kind: 'category', category })
          }}
        >
          수정
        </button>
      )}
    </div>
  )

  const tabs = (
    <div className="view-tabs">
      {(['shop', 'category'] as const).map((v) => (
        <button key={v} type="button" className={v === view ? 'active' : ''} onClick={() => setView(v)}>
          {v === 'shop' ? '구매처별' : '카테고리별'}
        </button>
      ))}
    </div>
  )

  const item = (s: ShopSel, label: string) => (
    <div
      key={s}
      className={['list-item', s === sel ? 'active' : '', s === 'none' ? 'no-shop' : ''].join(' ')}
      onClick={() => setPicked(s)}
    >
      <div className="grow">
        <strong>{label}</strong>
        <small>부자재 {parts.filter((p) => inShop(p, s)).length}개</small>
      </div>
    </div>
  )

  return (
    <>
      <Dialog size="wide" fixed title="부자재 관리" headExtra={tabs} onClose={onClose}>
        <div className="manage parts-manage">
          {view === 'shop' ? (
            <ManageColumn title="구매처" count={shops.length}>
              <div className="list">
                {item('', '전체')}
                {shops.map((s) => item(`s:${s}`, s))}
                {hasNoShop && item('none', '구매처 없음')}
              </div>
            </ManageColumn>
          ) : (
            <ManageColumn
              title="카테고리"
              count={categories.length}
              addLabel="+ 추가"
              onAdd={() => setSub({ kind: 'category', category: null })}
            >
              <div className="list">
                {categoryItem('', '전체')}
                {categories.map((c) => categoryItem(`c:${c.id}`, c.name, c))}
                {hasUncategorized && categoryItem('none', '미분류')}
              </div>
            </ManageColumn>
          )}
          <ManageColumn
            className="manage-right"
            title={selName ? `${selName} 의 부자재` : '전체 부자재'}
            count={list.length}
            addLabel="+ 부자재 추가"
            onAdd={() => setSub({ kind: 'part', part: null })}
          >
            {list.length ? (
              list.map((p) => (
                <div key={p.id} className="row-item">
                  <div>
                    <strong>{p.name}</strong>
                    <BuyLink part={p} />
                    <div className="hint">
                      {view === 'shop' ? `${categoryName(p.category) ?? '미분류'} · ` : `${p.shop || '구매처 없음'} · `}
                      제품 {p.product_count}개에서 사용
                    </div>
                  </div>
                  <div className="price">
                    {p.unit_price == null ? (
                      <span className="badge warn">가격 미입력</span>
                    ) : (
                      <>
                        {unitWon(p.unit_price)}
                        <div className="hint">{p.unit}당</div>
                      </>
                    )}
                  </div>
                  <div className="row-btns">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setSub({ kind: 'part', part: null, copyOf: p })}
                    >
                      복제
                    </button>
                    <button type="button" className="btn small" onClick={() => setSub({ kind: 'part', part: p })}>
                      수정
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={
                        p.product_count ? `제품 ${p.product_count}개에서 쓰고 있어서 삭제할 수 없어요` : '부자재 삭제'
                      }
                      onClick={() => remove(p)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="hint">등록된 부자재가 없어요.</p>
            )}
          </ManageColumn>
        </div>
      </Dialog>

      {/* 겹쳐 여는 창은 관리 창 안이 아니라 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {sub?.kind === 'part' && (
        <PartDialog
          part={sub.part}
          copyOf={sub.copyOf}
          shop={view === 'shop' && sel.startsWith('s:') ? sel.slice(2) : undefined}
          category={view === 'category' && catSel.startsWith('c:') ? Number(catSel.slice(2)) : undefined}
          categories={categories}
          parts={parts}
          usages={sub.part ? usagesOf(sub.part.id) : []}
          onClose={closeSub}
        />
      )}
      {sub?.kind === 'category' && (
        <PartCategoryDialog
          category={sub.category}
          parts={parts}
          onClose={closeSub}
          onSaved={(c) => setPickedCategory(`c:${c.id}`)}
        />
      )}
    </>
  )
}
