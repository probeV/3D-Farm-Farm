import { useState } from 'react'
import { deletePart, useRefreshProducts, type Part } from '../../api/products'
import Dialog from '../../components/Dialog'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { unitWon } from '../../format'
import PartDialog from './PartDialog'
import { inShop, shopsOf, type ShopSel } from './partList'
import { usePartsData } from './usePartsData'

// 관리 창 위에 겹쳐 여는 창
type Sub = { part: Part | null; copyOf?: Part }

// 부자재 관리 (PART-02 · PART-02a, docs/screens.md 3.4)
// 왼쪽: 전체 + 구매처 (+ 구매처 없음) / 오른쪽: 고른 구매처의 부자재. 부자재 추가 · 복제 · 삭제는 여기서
export default function ManageDialog({ onClose }: { onClose: () => void }) {
  const data = usePartsData().data
  const refresh = useRefreshProducts()
  const toast = useToast()

  const confirm = useConfirm()
  const [picked, setPicked] = useState<ShopSel>('')
  const [sub, setSub] = useState<Sub | null>(null)
  const closeSub = () => setSub(null)
  if (!data) return null

  const { parts, usagesOf } = data
  const shops = shopsOf(parts)
  const hasNoShop = parts.some((p) => !p.shop)
  // 고른 구매처의 부자재가 모두 없어졌으면(구매처를 바꾸거나 삭제) 전체로
  const sel: ShopSel = picked === 'none' ? (hasNoShop ? picked : '') : shops.includes(picked.slice(2)) ? picked : ''
  const list = parts.filter((p) => inShop(p, sel)).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const selName = sel === '' ? '' : sel === 'none' ? '구매처 없음' : sel.slice(2)

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
      <Dialog size="wide" fixed title="부자재 관리" onClose={onClose}>
        <div className="manage parts-manage">
          <div className="list">
            {item('', '전체')}
            {shops.map((s) => item(`s:${s}`, s))}
            {hasNoShop && item('none', '구매처 없음')}
          </div>
          <div className="manage-right">
            <h4>{selName ? `${selName} 의 부자재` : '전체 부자재'}</h4>
            {list.length ? (
              list.map((p) => (
                <div key={p.id} className="row-item">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="hint">
                      {sel === '' && `${p.shop || '구매처 없음'} · `}제품 {p.product_count}개에서 사용
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
                    <button type="button" className="btn small" onClick={() => setSub({ part: null, copyOf: p })}>
                      복제
                    </button>
                    <button type="button" className="btn small" onClick={() => setSub({ part: p })}>
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
            <button
              type="button"
              className="btn small"
              style={{ marginTop: 10 }}
              onClick={() => setSub({ part: null })}
            >
              + 부자재 추가
            </button>
          </div>
        </div>
      </Dialog>

      {/* 겹쳐 여는 창은 관리 창 안이 아니라 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {sub && (
        <PartDialog
          part={sub.part}
          copyOf={sub.copyOf}
          shop={sel.startsWith('s:') ? sel.slice(2) : undefined}
          usages={sub.part ? usagesOf(sub.part.id) : []}
          onClose={closeSub}
        />
      )}
    </>
  )
}
