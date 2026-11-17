import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keys as productKeys } from '../../../api/products'
import { keys as salesKeys } from '../../../api/sales'
import {
  importOrders,
  previewOrders,
  updateStoreLink,
  useConnection,
  useRefreshStore,
  useStoreImports,
  useStoreLinks,
  type StoreOrder,
} from '../../../api/store'
import Help from '../../../components/Help'
import SettingsButton from '../../../components/SettingsButton'
import { useToast } from '../../../components/useToast'
import { dotDate, today, won } from '../../../format'
import { useCostData } from '../../products/useCostData'
import { snapshotCost } from '../saleList'
import ConnLine from './ConnLine'
import LinkDialog from './LinkDialog'
import {
  actionable,
  countKinds,
  dimmed,
  importBody,
  initialChecked,
  KIND_BADGE,
  relink,
  settleGap,
  statusClass,
} from './storeOrders'

type Step = 'idle' | 'loading' | 'fetched'

// 일주일 전 (마지막으로 가져온 기록이 없을 때 시작일)
function weekAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 판매 › 스마트스토어 연동 (v2 STORE, 목업 docs/mockups/store.html): 연결 상태 → 주문 가져오기(미리보기 · 넣기) → 가져오기 기록
export default function StorePage({ onBack, onSettings }: { onBack: () => void; onSettings: () => void }) {
  const conn = useConnection()
  const links = useStoreLinks()
  const imports = useStoreImports()
  const cost = useCostData() // 넣을 때 판매 창과 같은 개당 원가 · 바로 연결할 제품 목록
  const refreshStore = useRefreshStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const now = today()
  const last = conn.data?.last_import
  const [range, setRange] = useState<{ from: string; to: string } | null>(null) // null = 기본(마지막으로 가져온 날 ~ 오늘)
  const from = range?.from ?? last?.date_to ?? weekAgo()
  const to = range?.to ?? now
  const [step, setStep] = useState<Step>('idle')
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [shown, setShown] = useState({ from, to }) // 미리보기한 기간 (넣기 기록용)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [mapping, setMapping] = useState(false)

  const connected = conn.data?.state === 'ok'
  const needLinks = links.data?.filter((l) => l.product == null).length ?? 0
  const products = cost.data?.rows.map((r) => r.product) ?? []

  const fetchOrders = async () => {
    if (from > to) return toast('시작일이 종료일보다 늦어요')
    setStep('loading')
    try {
      const list = await previewOrders(from, to)
      setOrders(list)
      setChecked(initialChecked(list))
      setShown({ from, to })
      setStep('fetched')
      links.refetch() // 처음 보는 스토어 상품의 연결 줄이 생겼을 수 있음
    } catch (e) {
      setStep('idle')
      toast(e instanceof Error ? e.message : '주문을 가져오지 못했어요')
      conn.refetch()
    }
  }

  // 미리보기에서 바로 연결: 그 연결 줄에 제품을 고르면 기억해 두고, 다음 가져오기부터 자동 (STORE-02)
  const linkNow = async (link: number, productId: string) => {
    const product = products.find((p) => String(p.id) === productId) ?? null
    try {
      const saved = await updateStoreLink(link, { product: product?.id ?? null })
      const next = relink(orders, link, product && { id: product.id, name: product.name })
      setOrders(next)
      setChecked((c) => new Set([...c, ...next.filter((o) => o.kind === 'ok').map((o) => o.order_id)]))
      links.refetch()
      if (product) toast(`'${saved.store_name}' → ${product.name} 로 연결했어요 · 다음부터 자동이에요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '연결하지 못했어요')
    }
  }

  const costOf = (product: number) => {
    const r = cost.data?.rows.find((x) => x.product.id === product)
    return r ? snapshotCost(r.cost) : null
  }

  const put = async () => {
    setBusy(true)
    try {
      const rec = await importOrders(importBody(orders, checked, shown, costOf))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.sales }),
        queryClient.invalidateQueries({ queryKey: productKeys.parts }), // 부속품 · 포장재 남은 수량
        queryClient.invalidateQueries({ queryKey: ['pl'] }),
        refreshStore(),
      ])
      setStep('idle')
      setOrders([])
      setChecked(new Set())
      setRange(null)
      const parts = [`판매 장부에 ${rec.added}건 넣었어요`, rec.updated ? `${rec.updated}건 맞췄어요` : '']
      toast(parts.filter(Boolean).join(' · '))
    } catch (e) {
      toast(e instanceof Error ? e.message : '넣지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const picked = orders.filter((o) => checked.has(o.order_id) && actionable(o))
  const counts = countKinds(orders)
  const okOrders = orders.filter(actionable)
  const allOn = okOrders.length > 0 && okOrders.every((o) => checked.has(o.order_id))
  const toggle = (id: string, on: boolean) =>
    setChecked((c) => {
      const next = new Set(c)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <>
      <div className="st-crumb">
        <button type="button" onClick={onBack}>
          판매
        </button>{' '}
        ›
      </div>
      <div className="top-row st-title">
        <h2>스마트스토어 연동</h2>
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => setMapping(true)}>
          상품 연결{needLinks > 0 && <span className="st-count">{needLinks}</span>}
        </button>
        <SettingsButton label="스마트스토어" onClick={onSettings} />
      </div>

      <ConnLine conn={conn.data} loading={conn.isLoading} onSettings={onSettings} />

      <div className="st-panel">
        <div className="st-panel-head">
          <h3>주문 가져오기</h3>
          <Help tip="기간 안에 결제 · 배송 · 취소 · 반품 · 구매확정된 주문을 스마트스토어에서 가져와 미리 보여 줘요. 판매 장부에는 확인하고 넣어요. 같은 주문은 두 번 들어가지 않고, 이미 넣은 주문이 취소 · 반품되면 맞춰요" />
          <div className="spacer" />
          <span className="range">
            <span className="hint">기간</span>
            <input
              type="date"
              aria-label="시작일"
              value={from}
              max={now}
              onChange={(e) => setRange({ from: e.target.value, to })}
            />
            ~
            <input
              type="date"
              aria-label="종료일"
              value={to}
              max={now}
              onChange={(e) => setRange({ from, to: e.target.value })}
            />
          </span>
          <button
            type="button"
            className="btn primary"
            disabled={!connected || step === 'loading'}
            onClick={fetchOrders}
          >
            {step === 'loading' ? (
              <>
                <span className="st-loading" /> 가져오는 중
              </>
            ) : (
              '가져오기'
            )}
          </button>
        </div>
        {step !== 'fetched' ? (
          <div className="st-empty">
            {step === 'loading' ? (
              '스마트스토어에서 주문을 가져오는 중이에요… (하루에 0.5초쯤)'
            ) : (
              <>
                <div className="big">
                  {last
                    ? `마지막으로 가져온 날(${dotDate(last.date_to)}) 이후 주문을 가져와요`
                    : '기간을 골라 주문을 가져와요'}
                </div>
                한 번에 31일까지. 기간을 바꿔서 지난 주문을 다시 볼 수도 있어요.
              </>
            )}
          </div>
        ) : orders.length === 0 ? (
          <div className="st-empty">이 기간에 바뀐 주문이 없어요.</div>
        ) : (
          <>
            <div className="st-sum">
              <span>
                가져온 주문 <b>{orders.length}건</b>
              </span>
              {counts.ok ? (
                <span>
                  새 주문 <b>{counts.ok}건</b>
                </span>
              ) : null}
              {counts.sync || counts.gone ? (
                <span>
                  맞출 주문 <b>{(counts.sync ?? 0) + (counts.gone ?? 0)}건</b>
                </span>
              ) : null}
              {counts.need ? <span className="warn-t">상품 연결 필요 {counts.need}건</span> : null}
              {counts.dup ? <span>이미 있음 {counts.dup}건</span> : null}
              {counts.cancel ? <span>취소 · 반품 {counts.cancel}건</span> : null}
              {counts.wait ? <span>결제 전 {counts.wait}건</span> : null}
            </div>
            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th className="chk">
                      <input
                        type="checkbox"
                        aria-label="모두 고르기"
                        checked={allOn}
                        disabled={okOrders.length === 0}
                        onChange={(e) => okOrders.forEach((o) => toggle(o.order_id, e.target.checked))}
                      />
                    </th>
                    <th>결제일 · 주문번호</th>
                    <th>스토어 상품 → 이 앱의 제품</th>
                    <th className="num">수량</th>
                    <th className="num">판매가</th>
                    <th className="num">배송비</th>
                    <th className="num">
                      수수료
                      <Help tip="스마트스토어가 알려 준 실제 수수료 (결제 + 판매 + 판매 연동 + 채널). 정산 전이면 예정 금액이에요" />
                    </th>
                    <th className="num">정산 금액</th>
                    <th>상태</th>
                  </tr>
                </thead>
                {orders.map((o) => (
                  <OrderRows
                    key={o.order_id}
                    order={o}
                    checked={checked.has(o.order_id)}
                    onCheck={(on) => toggle(o.order_id, on)}
                    products={products}
                    onLink={linkNow}
                  />
                ))}
              </table>
            </div>
            <div className="st-foot">
              <span className="hint">이미 있는 주문 · 취소된 새 주문은 넣지 않아요.</span>
              <div className="spacer" />
              <span>
                {picked.length}건 · {won(picked.reduce((a, o) => a + o.gross, 0))}
              </span>
              <button type="button" className="btn primary" disabled={!picked.length || busy} onClick={put}>
                {picked.length}건 판매 장부에 넣기
              </button>
            </div>
          </>
        )}
      </div>

      <div className="st-panel">
        <div className="st-panel-head">
          <h3>가져오기 기록</h3>
        </div>
        {imports.data?.length ? (
          imports.data.map((l) => (
            <div key={l.id} className="st-log">
              <span className="when">{dotDate(l.created_at.slice(0, 16).replace('T', ' '))}</span>
              <span>
                {dotDate(l.date_from)} ~ {dotDate(l.date_to).slice(5)} · 판매 장부에 <b>{l.added}건</b> 넣음
                {l.updated ? ` · ${l.updated}건 맞춤` : ''}
                {l.skipped ? ` · ${l.skipped}건 뺌` : ''}
              </span>
            </div>
          ))
        ) : (
          <div className="st-empty small">아직 가져온 적이 없어요.</div>
        )}
      </div>

      {mapping && <LinkDialog products={products} onClose={() => setMapping(false)} />}
    </>
  )
}

function OrderRows({
  order: o,
  checked,
  onCheck,
  products,
  onLink,
}: {
  order: StoreOrder
  checked: boolean
  onCheck: (on: boolean) => void
  products: { id: number; name: string }[]
  onLink: (link: number, product: string) => void
}) {
  const badge = KIND_BADGE[o.kind]
  const gap = settleGap(o)
  return (
    <tbody className={dimmed(o) ? 'order off' : 'order'}>
      {o.lines.map((l, i) => (
        <tr key={l.store_item_id} className={i ? 'item' : ''}>
          {i ? (
            <>
              <td />
              <td />
            </>
          ) : (
            <>
              <td className="chk">
                <input
                  type="checkbox"
                  aria-label="이 주문 넣기"
                  checked={checked}
                  disabled={!actionable(o)}
                  onChange={(e) => onCheck(e.target.checked)}
                />
              </td>
              <td>
                <div className="date">{dotDate(o.date)}</div>
                <div className="ono">{o.order_id}</div>
              </td>
            </>
          )}
          <td>
            <div className={l.alive ? 'store-name' : 'store-name gone'}>
              {l.store_name}
              {l.option && <span className="store-opt"> {l.option}</span>}
              {!l.alive && <span className="store-opt"> · {l.status_label}</span>}
            </div>
            <div className="arrow-to">
              <span className="to">→</span>
              {l.product != null ? (
                <span className="app-prod">{l.product_name}</span>
              ) : l.link != null && (o.kind === 'need' || o.kind === 'ok') ? (
                <select aria-label="이 앱의 제품 고르기" value="" onChange={(e) => onLink(l.link!, e.target.value)}>
                  <option value="">제품 고르기</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="hint">연결 없음</span>
              )}
            </div>
          </td>
          <td className="num">{l.qty}</td>
          <td className="num">{won(l.amount)}</td>
          {i ? (
            <>
              <td />
              <td />
              <td />
              <td />
            </>
          ) : (
            <>
              <td className="num">{o.shipping ? won(o.shipping) : '-'}</td>
              <td className="num">{o.fee ? `−${won(o.fee)}` : '-'}</td>
              <td className="num amount">
                {won(o.settle)}
                {gap !== 0 && (
                  <div className="st-gap" title={`네이버 정산 예정 ${won(o.naver_settle)}`}>
                    네이버 {won(o.naver_settle)}
                  </div>
                )}
              </td>
              <td>
                <span className={`badge ${statusClass(o.status)}`}>{o.status_label}</span>
                {badge && (
                  <div className="st-kind">
                    <span className={`badge ${badge[1]}`}>{badge[0]}</span>
                  </div>
                )}
                {o.changes.length > 0 && <div className="st-changes">{o.changes.join(' · ')}</div>}
              </td>
            </>
          )}
        </tr>
      ))}
    </tbody>
  )
}
