import { useState } from 'react'
import { replacePart, useRefreshProducts, type Part } from '../../api/products'
import Dialog from '../../components/Dialog'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { won } from '../../format'
import StatusBadge from '../products/StatusBadge'
import type { Usage } from './partList'

interface Props {
  parts: Part[]
  usagesOf: (partId: number) => Usage[]
  onClose: () => void
}

const byName = (a: Part, b: Part) => a.name.localeCompare(b.name, 'ko')

// 제품의 부자재 바꾸기 (TBD-23, docs/screens.md 3.6): 제품에서 쓰는 A 줄을 B 로. 부자재 자체는 그대로 (A 도 남는다).
// 수량은 그대로, 그 제품에 이미 B 가 있으면 수량을 더해 한 줄로. 고른 제품만 / 전부, 다른 데이터가 바뀌는 동작이라 2차 확인
export default function ReplaceDialog({ parts, usagesOf, onClose }: Props) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const confirm = useConfirm()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [off, setOff] = useState<Set<number>>(new Set()) // 체크를 뺀 제품
  const [busy, setBusy] = useState(false)

  const from = parts.find((p) => String(p.id) === fromId)
  const to = parts.find((p) => String(p.id) === toId && p !== from)
  const users = from ? usagesOf(from.id) : []
  const picked = users.filter((u) => !off.has(u.productId))
  // 그 제품에 이미 있는 B 수량 (합쳐짐)
  const toQty = (productId: number) => (to ? usagesOf(to.id).find((u) => u.productId === productId)?.qty : undefined)

  const run = async (all: boolean) => {
    if (!from || !to) return
    const targets = all ? users : picked
    const ok = await confirm({
      title: '부자재 바꾸기',
      message: `${from.name} → ${to.name} 로 바꿀까요?`,
      twice: true,
      okLabel: '바꾸기',
      againLabel: '정말 바꾸기',
      effects: [
        {
          title: `제품 ${targets.length}개의 부자재가 바뀌어요`,
          details: [targets.map((u) => u.name).join(' · '), '원가가 바로 다시 계산돼요.'],
        },
      ],
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await replacePart(from.id, { to: to.id, products: all ? undefined : targets.map((u) => u.productId) })
      await refresh()
      toast(`제품 ${res.replaced}개를 ${to.name} 로 바꿨어요`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const amount = (p: Part | undefined, qty: number) => won((p?.unit_price ?? 0) * qty)

  return (
    <Dialog
      size="wide"
      title="제품의 부자재 바꾸기"
      onClose={onClose}
      submitLabel={`전부 바꾸기${from ? ` (${users.length}개)` : ''}`}
      onSubmit={() => run(true)}
      busy={busy || !to}
      footerLeft={
        // 일부 제품의 체크를 뺐을 때만
        <button
          type="button"
          className="btn"
          disabled={busy || !to || !picked.length || picked.length === users.length}
          onClick={() => run(false)}
        >
          고른 제품 {picked.length}개만 바꾸기
        </button>
      }
    >
      <p className="hint" style={{ margin: '0 0 12px' }}>
        제품에서 쓰는 부자재를 다른 부자재로 한 번에 바꿔요. 부자재 자체는 지워지거나 바뀌지 않아요.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>지금 쓰는 부자재 *</span>
          <select
            value={fromId}
            data-autofocus
            onChange={(e) => {
              setFromId(e.target.value)
              setOff(new Set())
            }}
          >
            <option value="">고르세요</option>
            {parts
              .filter((p) => p.product_count)
              .sort(byName)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · 제품 {p.product_count}개
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>바꿀 부자재 *</span>
          <select value={to ? toId : ''} disabled={!from} onChange={(e) => setToId(e.target.value)}>
            <option value="">고르세요</option>
            {parts
              .filter((p) => p !== from)
              .sort(byName)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {from && p.unit !== from.unit ? ` (${p.unit})` : ''}
                </option>
              ))}
          </select>
        </label>
      </div>
      {from && to && from.unit !== to.unit && (
        <div className="notice">
          단위가 달라요:{' '}
          <b>
            {from.unit} → {to.unit}
          </b>
          . 수량은 그대로 옮기니, 바꾼 뒤 제품마다 수량을 확인하세요.
        </div>
      )}
      {from && (
        <>
          <div className="used-head" style={{ marginTop: 14 }}>
            <span>
              바꿀 제품 {picked.length} / {users.length} · 제품 1개당 금액
            </span>
          </div>
          {users.map((u) => {
            const has = toQty(u.productId)
            const before = (from.unit_price ?? 0) * u.qty
            const after = (to?.unit_price ?? 0) * u.qty
            const diff = Math.round(after) - Math.round(before)
            return (
              <label key={u.productId} className={off.has(u.productId) ? 'rep-row off' : 'rep-row'}>
                <input
                  type="checkbox"
                  checked={!off.has(u.productId)}
                  onChange={(e) => {
                    const next = new Set(off)
                    if (e.target.checked) next.delete(u.productId)
                    else next.add(u.productId)
                    setOff(next)
                  }}
                />
                <span>
                  {u.name}
                  <StatusBadge status={u.status} />
                  {has != null && to && (
                    <span className="merge">
                      이미 {to.name} {has}
                      {to.unit} 있음 → 합쳐서 {has + u.qty}
                      {to.unit}
                    </span>
                  )}
                </span>
                <span className="qty">
                  {u.qty.toLocaleString('ko-KR')}
                  {from.unit}
                </span>
                <span className="amt">
                  {to ? (
                    <>
                      <span className="was">{amount(from, u.qty)} → </span>
                      <span className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>{won(after)}</span>
                    </>
                  ) : (
                    won(before)
                  )}
                </span>
              </label>
            )
          })}
        </>
      )}
    </Dialog>
  )
}
