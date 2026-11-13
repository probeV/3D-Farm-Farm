import { useCallback, useState } from 'react'
import { useSales, type Sale, type SaleChannel } from '../../api/sales'
import Help from '../../components/Help'
import SettingsButton from '../../components/SettingsButton'
import SortTh from '../../components/SortTh'
import { downloadText } from '../../csv'
import { dotDate, pct, today, won } from '../../format'
import { nextSort } from '../../sort'
import { useCostData } from '../products/useCostData'
import { CHANNELS, channelLabel } from './channels'
import SaleDialog from './SaleDialog'
import {
  byProduct,
  filterSales,
  inPeriod,
  NO_FILTER,
  PERIODS,
  qtyOf,
  salesCsv,
  SORT_COLUMNS,
  summarize,
  type ListFilter,
  type Period,
  type Sort,
} from './saleList'

type DialogState = { id: number | null; copyOf?: Sale }

// 판매 화면: 요약 카드 → 제품별 판매 → 판매 목록 (docs/screens.md 판매, 목업 docs/mockups/sales.html)
export default function SalesPage({ onSettings }: { onSettings: () => void }) {
  const sales = useSales()
  const cost = useCostData() // 판매 창의 제품 목록 · 원가 계산표 · 수수료 설정
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  const error = sales.error ?? cost.error
  if (error) {
    return (
      <div className="empty">
        불러오지 못했어요: {error.message}{' '}
        <button
          className="btn small"
          onClick={() => {
            sales.refetch()
            cost.retry()
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (!sales.data || !cost.data) return <div className="empty">불러오는 중…</div>

  const all = sales.data
  const now = today()
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const sum = summarize(all, now)
  const prods = byProduct(all.filter((s) => inPeriod(s.date, filter, now)))
  const maxProd = Math.max(1, ...prods.map((p) => p.amount))
  const list = filterSales(all, filter, now)
  const listGross = list.reduce((a, s) => a + s.gross, 0)
  const filtered = filter.q !== '' || filter.channel !== '' || filter.product !== '' || filter.period !== 'all'
  const periodText =
    filter.period === 'custom'
      ? `${filter.from || '처음'} ~ ${filter.to || '오늘'}`
      : PERIODS.find((p) => p.key === filter.period)!.label
  const th = {
    sort: filter.sort,
    onSort: (key: Sort['key']) => set({ sort: nextSort(SORT_COLUMNS, filter.sort, key) }),
  }

  return (
    <>
      <div className="top-row">
        <span className="hint">팔린 주문을 기록해요. 한 주문에 제품 여러 개를 넣을 수 있어요.</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setDialog({ id: null })}>
          + 판매 추가
        </button>
        <SettingsButton label="스마트스토어" onClick={onSettings} />
      </div>

      <div className="sum-cards four">
        <div className="sum-card sale-main">
          <span>
            이번 달 매출
            <Help tip={`${now.slice(0, 4)}년 ${Number(now.slice(5, 7))}월 · 판매가 합계 (배송비 · 수수료 빼기 전)`} />
          </span>
          <strong>{won(sum.monthGross)}</strong>
          <span className="sub">
            주문 {sum.monthCount}건 · {sum.monthQty}개
          </span>
        </div>
        <div className="sum-card">
          <span>
            이번 달 정산 금액
            <Help tip="판매가 + 받은 배송비 − 수수료 · 통장에 들어오는 돈" />
          </span>
          <strong>{won(sum.monthSettle)}</strong>
          <span className="sub">수수료 {won(sum.monthFee)}</span>
        </div>
        <div className="sum-card">
          <span>
            이번 달 주문 이익
            <Help tip="주문별 이익(정산 금액 − 원가 − 낸 택배비)의 합계. 참고값이에요 — 구독 · 광고 같은 운영비와 실패 출력은 빠져 있어요. 실제 월 이익은 손익 화면에서" />
          </span>
          <strong>{won(sum.monthProfit)}</strong>
          <span className="sub">
            판매가의 {pct(sum.monthProfitRate)}
            {sum.monthNoCost && ' · 원가 없는 주문 제외'}
          </span>
        </div>
        <div className="sum-card">
          <span>
            누적 매출
            <Help tip="전체 기간 판매가 합계" />
          </span>
          <strong>{won(sum.total)}</strong>
          <span className="sub">
            주문 {sum.count}건 · {sum.qty}개{sum.since && ` · ${dotDate(sum.since)}부터`}
          </span>
        </div>
      </div>

      <div className="by-cat">
        <div className="by-cat-head">
          <h4>제품별 판매</h4>
          <span className="hint">{periodText} · 판매가 합계 순 · 누르면 그 제품이 든 주문만</span>
        </div>
        {prods.length ? (
          <div className="by-cat-grid">
            {prods.map((p) => (
              <button
                key={p.key}
                type="button"
                className={['cat-row', 'prod-row', filter.product === p.key ? 'active' : ''].join(' ')}
                title={p.name}
                onClick={() => set({ product: filter.product === p.key ? '' : p.key })}
              >
                <span className="pn">{p.name}</span>
                <span className="bar">
                  <i style={{ width: `${(p.amount / maxProd) * 100}%` }} />
                </span>
                <span className="qty">{p.qty}개</span>
                <span className="amt">{won(p.amount)}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="hint">이 기간에 판매가 없어요.</span>
        )}
      </div>

      <div className="section-head list-toolbar">
        <h3>판매 목록</h3>
        <span className="hint">{list.length}건</span>
        <span className="list-total">{won(listGross)}</span>
        <div className="spacer" />
        <select value={filter.period} onChange={(e) => set({ period: e.target.value as Period })}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              기간: {p.label}
            </option>
          ))}
        </select>
        {filter.period === 'custom' && (
          <span className="range">
            <input
              type="date"
              aria-label="시작일"
              value={filter.from}
              max={now}
              onChange={(e) => set({ from: e.target.value })}
            />
            ~
            <input
              type="date"
              aria-label="종료일"
              value={filter.to}
              max={now}
              onChange={(e) => set({ to: e.target.value })}
            />
          </span>
        )}
        <select value={filter.channel} onChange={(e) => set({ channel: e.target.value as SaleChannel | '' })}>
          <option value="">판매처: 전체</option>
          {CHANNELS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="제품 · 주문번호 · 메모 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        {filtered && (
          <button
            className="btn small"
            onClick={() => set({ q: '', channel: '', product: '', period: 'all', from: '', to: '' })}
          >
            필터 지우기
          </button>
        )}
        <button
          className="btn small"
          title="보이는 목록을 엑셀용 CSV 로"
          disabled={!list.length}
          onClick={() => downloadText(`판매_${now}.csv`, salesCsv(list))}
        >
          CSV 내보내기
        </button>
      </div>

      {list.length ? (
        <div className="table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <SortTh sortKey="date" {...th}>
                  날짜
                </SortTh>
                <SortTh sortKey="channel" {...th}>
                  판매처
                </SortTh>
                <SortTh sortKey="product" {...th}>
                  제품
                </SortTh>
                <SortTh sortKey="qty" num {...th}>
                  수량
                </SortTh>
                <SortTh sortKey="gross" num {...th}>
                  판매가
                </SortTh>
                <SortTh sortKey="shipping" num {...th}>
                  배송비
                </SortTh>
                <SortTh sortKey="fee" num {...th}>
                  수수료
                </SortTh>
                <SortTh sortKey="settle" num {...th}>
                  정산 금액
                </SortTh>
                <SortTh sortKey="cost" num {...th}>
                  원가
                </SortTh>
                <SortTh sortKey="profit" num {...th}>
                  이익
                </SortTh>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} onClick={() => setDialog({ id: s.id })}>
                  <td className="date">{dotDate(s.date)}</td>
                  <td>
                    <span className={s.channel === 'store' ? 'ch store' : 'ch'}>{channelLabel(s.channel)}</span>
                  </td>
                  <td className="pname" title={s.items.map((i) => `${i.product_name} × ${i.qty}`).join('\n')}>
                    {s.items[0]?.product_name}
                    {s.items.length > 1 && <span className="more">외 {s.items.length - 1}</span>}
                  </td>
                  <td className="num">{qtyOf(s)}</td>
                  <td className="num">{won(s.gross)}</td>
                  <td className={s.shipping_received ? 'num' : 'num muted'}>
                    {s.shipping_received ? won(s.shipping_received) : '-'}
                  </td>
                  <td className={s.fee ? 'num' : 'num muted'}>{s.fee ? `−${won(s.fee)}` : '-'}</td>
                  <td className="num">{won(s.settle)}</td>
                  <td className="num muted">
                    {s.cost == null ? <span className="badge warn">원가 없음</span> : won(s.cost)}
                  </td>
                  <td className={s.profit != null && s.profit < 0 ? 'num amount neg' : 'num amount'}>
                    {s.profit == null ? '-' : won(s.profit)}
                    {s.profit != null && <span className="rate">{pct(s.gross ? s.profit / s.gross : null)}</span>}
                  </td>
                  <td className="note" title={s.note}>
                    {s.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {all.length ? '조건에 맞는 판매가 없어요.' : '아직 기록한 판매가 없어요. + 판매 추가로 시작하세요.'}
        </div>
      )}

      {dialog && renderSale(dialog.id, dialog.copyOf)}
    </>
  )

  // 판매가 지워졌으면(다른 창에서) 그리지 않는다. 복제는 새 창으로 바꿔 연다
  function renderSale(id: number | null, copyOf?: Sale) {
    const sale = id == null ? null : all.find((s) => s.id === id)
    if (sale === undefined || !cost.data) return null
    return (
      <SaleDialog
        key={id ?? `new-${copyOf?.id ?? ''}`}
        sale={sale}
        copyOf={copyOf}
        rows={cost.data.rows}
        setting={cost.data.catalog.setting}
        onCopy={(s) => setDialog({ id: null, copyOf: s })}
        onClose={closeDialog}
      />
    )
  }
}
