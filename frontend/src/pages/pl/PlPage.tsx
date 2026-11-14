import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlMonth } from '../../api/pl'
import { usePl } from '../../api/pl'
import Help from '../../components/Help'
import { today } from '../../format'
import { CATEGORIES } from '../expenses/categories'
import {
  calc,
  chartCols,
  isEmptyMonth,
  manText,
  monthsIn,
  niceStep,
  recovery,
  signedWon,
  type Basis,
  type Period,
  type PlResult,
} from './plCalc'

const pctText = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')
const sign = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '')
const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`

// 손익 화면: 기간 · 기준 전환 → 요약 카드 3개 → 계산표(+ 두 기준 차이) | 월별 그래프 (목업 docs/mockups/pl.html)
// 새로 입력하는 것 없음. 판매 · 지출 · 스풀을 서버가 달마다 더해 주고, 기간 합계 · 두 기준은 plCalc.ts
export default function PlPage() {
  const pl = usePl()
  if (pl.error) {
    return (
      <div className="empty">
        불러오지 못했어요: {pl.error.message}{' '}
        <button className="btn small" onClick={() => pl.refetch()}>
          다시 시도
        </button>
      </div>
    )
  }
  if (!pl.data) return <div className="empty">불러오는 중…</div>
  return <PlView months={pl.data} />
}

function PlView({ months }: { months: PlMonth[] }) {
  const first = months[0].month
  const last = months[months.length - 1].month // 이번 달
  const thisMonth = today().slice(0, 7)
  const [basis, setBasis] = useState<Basis>('pl')
  const [period, setPeriod] = useState<Period>({ kind: 'month', m: last })
  const [pick, setPick] = useState<string | null>(null) // 기간 고르기 창에서 보고 있는 해. null = 닫힘
  const Y0 = first.slice(0, 4)
  const Y1 = last.slice(0, 4)

  const isPL = basis === 'pl'
  const r = calc(monthsIn(months, period))
  const all = calc(months)
  const rec = recovery(all)
  const main = isPL ? r.net : r.cash

  const label =
    period.kind === 'month'
      ? monthLabel(period.m) + (period.m === thisMonth ? ' (진행 중)' : '')
      : period.kind === 'year'
        ? `${period.y}년`
        : `전체 (${first.replace('-', '.')}~)`

  const keys = months.map((m) => m.month)
  const canPrev = period.kind === 'month' ? period.m > first : period.kind === 'year' ? period.y > Y0 : false
  const canNext = period.kind === 'month' ? period.m < last : period.kind === 'year' ? period.y < Y1 : false
  const step = (d: number) => {
    if (period.kind === 'month') setPeriod({ kind: 'month', m: keys[keys.indexOf(period.m) + d] ?? period.m })
    if (period.kind === 'year') setPeriod({ kind: 'year', y: String(Number(period.y) + d) })
  }
  const choose = (p: Period) => {
    setPeriod(p)
    setPick(null)
  }
  const openPick = () =>
    setPick(pick ? null : period.kind === 'year' ? period.y : period.kind === 'month' ? period.m.slice(0, 4) : Y1)

  // 그래프는 고른 해의 달 (전체 기간이면 처음부터). 누적 잔액은 처음부터 더한 값
  const chartYear = period.kind === 'year' ? period.y : period.kind === 'month' ? period.m.slice(0, 4) : null
  const cols = chartCols(months, basis).filter((c) => !chartYear || c.month.startsWith(`${chartYear}-`))

  return (
    <>
      <div className="top-row">
        <div className="pl-period">
          <button type="button" className="btn pl-arrow" disabled={!canPrev} onClick={() => step(-1)} aria-label="이전">
            ‹
          </button>
          <div className="pl-picker-wrap">
            <button
              type="button"
              className={pick ? 'pl-period-btn open' : 'pl-period-btn'}
              aria-expanded={pick != null}
              onClick={openPick}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              {label}
              <span className="chev">▾</span>
            </button>
            {pick && (
              <Picker
                year={pick}
                months={months}
                period={period}
                Y0={Y0}
                Y1={Y1}
                thisMonth={thisMonth}
                onYear={setPick}
                onChoose={choose}
                onClose={() => setPick(null)}
              />
            )}
          </div>
          <button type="button" className="btn pl-arrow" disabled={!canNext} onClick={() => step(1)} aria-label="다음">
            ›
          </button>
        </div>
        <div className="spacer" />
        <div className="pl-basis" role="tablist" aria-label="기준">
          <button
            type="button"
            role="tab"
            aria-selected={!isPL}
            className={!isPL ? 'on' : ''}
            onClick={() => setBasis('cash')}
          >
            현금 기준
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isPL}
            className={isPL ? 'on' : ''}
            onClick={() => setBasis('pl')}
          >
            손익 기준
          </button>
        </div>
      </div>

      <div className="sum-cards pl-sums">
        <div className="sum-card">
          <span>
            {isPL ? '순이익' : '들어온 돈 − 나간 돈'} · {label}
            <Help
              tip={
                isPL ? '매출 − 재료비 − 운영비 − 세금. 장비는 빠져 있어요' : '판매 정산 금액 − 지출 전부 (장비 포함)'
              }
              down
            />
          </span>
          <strong className={sign(main)}>{signedWon(main)}</strong>
          <span className="sub">
            {isPL
              ? `매출 ${signedWon(r.revenue)} · 이익률 ${pctText(r.net, r.revenue)}`
              : `들어온 돈 ${signedWon(r.settle)} · 나간 돈 ${signedWon(r.outAll)}`}
          </span>
        </div>
        <div className="sum-card">
          <span>
            투자 회수
            <Help
              tip="처음부터 지금까지 손익 기준 순이익 ÷ 누적 투자금(지출의 장비 합계). 기간 선택과 상관없이 전체로 계산해요"
              down
            />
          </span>
          <strong>{rec == null ? '-' : `${Math.round(rec * 100)}%`}</strong>
          <div className="pl-meter">
            <i style={{ width: `${Math.min(100, Math.max(0, (rec ?? 0) * 100))}%` }} />
          </div>
          <span className="sub">
            {all.invest ? `${signedWon(Math.max(0, all.net))} / ${signedWon(all.invest)}` : '장비 지출 없음'}
          </span>
        </div>
        <div className="sum-card">
          <span>
            누적 잔액
            <Help tip="처음부터 지금까지 현금 기준 합계 (들어온 돈 − 나간 돈). 사업 통장에 남아 있어야 하는 돈" down />
          </span>
          <strong className={sign(all.cash)}>{signedWon(all.cash)}</strong>
          <span className="sub">
            들어온 {signedWon(all.settle)} · 나간 {signedWon(all.outAll)}
          </span>
        </div>
      </div>

      <div className="pl-grid">
        <div className="pl-panel">
          <div className="pl-panel-head">
            <h3>{isPL ? '손익 계산' : '현금 흐름'}</h3>
            <span className="hint">{label}</span>
          </div>
          {isPL ? <PlTable r={r} /> : <CashTable r={r} />}
          <DiffBox r={r} />
        </div>
        <div className="pl-panel">
          <div className="pl-panel-head">
            <h3>월별 {isPL ? '매출 · 비용 · 순이익' : '들어온 돈 · 나간 돈 · 누적 잔액'}</h3>
            <div className="spacer" />
            <span className="hint">막대를 누르면 그 달로</span>
          </div>
          <Chart
            cols={cols}
            basis={basis}
            selected={period.kind === 'month' ? period.m : null}
            onMonth={(m) => choose({ kind: 'month', m })}
          />
        </div>
      </div>
    </>
  )
}

// 기간 고르기 창: 연도를 넘기고, 달을 누르면 그 달 · `○년` · `전체 기간`. 기록 없는 달은 흐리게
function Picker(props: {
  year: string
  months: PlMonth[]
  period: Period
  Y0: string
  Y1: string
  thisMonth: string
  onYear: (y: string) => void
  onChoose: (p: Period) => void
  onClose: () => void
}) {
  const { year, months, period, Y0, Y1, thisMonth, onYear, onChoose, onClose } = props
  const ref = useRef<HTMLDivElement>(null)
  // 바깥을 누르거나 Esc 면 닫기 (기간 버튼은 자기가 열고 닫으므로 빼고)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest('.pl-period-btn')) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])
  const byKey = new Map(months.map((m) => [m.month, m]))
  return (
    <div className="pl-picker" role="dialog" aria-label="기간 고르기" ref={ref}>
      <div className="py">
        <button
          type="button"
          className="btn pl-arrow"
          disabled={year <= Y0}
          onClick={() => onYear(String(Number(year) - 1))}
          aria-label="이전 해"
        >
          ‹
        </button>
        <b>{year}년</b>
        <button
          type="button"
          className="btn pl-arrow"
          disabled={year >= Y1}
          onClick={() => onYear(String(Number(year) + 1))}
          aria-label="다음 해"
        >
          ›
        </button>
      </div>
      <div className="mgrid">
        {Array.from({ length: 12 }, (_, i) => {
          const m = `${year}-${String(i + 1).padStart(2, '0')}`
          const row = byKey.get(m)
          const cls = [
            period.kind === 'month' && period.m === m ? 'on' : '',
            m === thisMonth ? 'now' : '',
            row && isEmptyMonth(row) ? 'empty' : '',
          ]
          return (
            <button
              key={m}
              type="button"
              className={cls.filter(Boolean).join(' ')}
              disabled={!row}
              title={row && isEmptyMonth(row) ? '기록 없음' : undefined}
              onClick={() => onChoose({ kind: 'month', m })}
            >
              {i + 1}월
            </button>
          )
        })}
      </div>
      <div className="pfoot">
        <button
          type="button"
          className={period.kind === 'year' && period.y === year ? 'btn on' : 'btn'}
          onClick={() => onChoose({ kind: 'year', y: year })}
        >
          {year}년
        </button>
        <button
          type="button"
          className={period.kind === 'all' ? 'btn on' : 'btn'}
          onClick={() => onChoose({ kind: 'all' })}
        >
          전체 기간
        </button>
      </div>
    </div>
  )
}

// 계산표 한 줄. sub = 들여 쓴 하위 줄, total = 단계 합계, final = 맨 아래
function Line(props: {
  label: ReactNode
  value: number
  kind?: 'sub' | 'total' | 'final'
  op?: string
  tip?: string
  pct?: string
  signed?: boolean
  na?: string // 값 대신 흐린 글씨 (예: `기록 없음`)
}) {
  const { label, value, kind, op, tip, pct, signed, na } = props
  return (
    <tr className={kind}>
      <td>
        {op && <span className="op">{op}</span>}
        {label}
        {tip && <Help tip={tip} />}
      </td>
      <td className={`num ${signed ? sign(value) : ''}`}>
        {na ? <span className="na">{na}</span> : signedWon(value)}
        {pct && <span className="pct">{pct}</span>}
      </td>
    </tr>
  )
}

const Gap = () => (
  <tr className="gap">
    <td colSpan={2} />
  </tr>
)

function PlTable({ r }: { r: PlResult }) {
  return (
    <table className="pl-stmt">
      <tbody>
        <Line label="매출" value={r.revenue} tip="판매가 합계 + 손님이 낸 배송비 (판매 장부)" />
        <Line label="판매가" value={r.gross} kind="sub" />
        <Line label="받은 배송비" value={r.shipping} kind="sub" />
        <Gap />
        <Line
          label="재료비"
          value={r.material}
          op="−"
          tip="사용 시작한 스풀의 구매가 + 판매 · 조정으로 빠진 부속품 · 포장재(빠질 때 단가). 필라멘트 · 부속품 · 포장재 지출은 산 날이 아니라 쓴 만큼으로 들어가요"
        />
        <Line
          label={
            <>
              스풀 {r.spools}개 사용 시작
              {r.unpriced > 0 && (
                <span className="pl-warn">
                  가격 없음 {r.unpriced}
                  <Help tip="구매가 · 색상 가격 · 필라멘트 가격이 모두 없는 스풀. 0원으로 계산해요" />
                </span>
              )}
            </>
          }
          value={r.spool}
          kind="sub"
        />
        <Line
          label={
            <>
              부속품 · 포장재 사용
              {r.partUnpriced > 0 && (
                <span className="pl-warn">
                  가격 없음 {r.partUnpriced}
                  <Help tip="빠질 때 구매가가 없던 품목. 0원으로 계산해요" />
                </span>
              )}
            </>
          }
          value={r.partUsed}
          kind="sub"
        />
        <Line label="매출총이익" value={r.grossProfit} kind="total" pct={pctText(r.grossProfit, r.revenue)} signed />
        <Gap />
        <Line
          label="운영비"
          value={r.opsSum}
          op="−"
          tip="판매 수수료 + 지출 장부의 판매비 · 구독 · 소모품 · 기타. 장비는 빼요"
        />
        <Line label="판매 수수료" value={r.ops.fee} kind="sub" />
        <Line label="판매비 (택배 · 광고)" value={r.ops.sell} kind="sub" />
        <Line label="구독 · 운영" value={r.ops.sub} kind="sub" />
        <Line label="소모품" value={r.ops.supply} kind="sub" />
        <Line label="기타" value={r.ops.etc} kind="sub" />
        <Line label="영업이익" value={r.operating} kind="total" pct={pctText(r.operating, r.revenue)} signed />
        <Gap />
        <Line
          label="세금"
          value={r.tax}
          op="−"
          na={r.tax ? undefined : '기록 없음'}
          tip="종합소득세 등. 지출에서 분류 `세금` 으로 기록해요"
        />
        <Line label="순이익" value={r.net} kind="final" pct={pctText(r.net, r.revenue)} signed />
      </tbody>
    </table>
  )
}

function CashTable({ r }: { r: PlResult }) {
  const cats = CATEGORIES.filter((c) => r.byCat[c.key])
  return (
    <table className="pl-stmt">
      <tbody>
        <Line label="들어온 돈" value={r.settle} tip="판매 정산 금액 합계 (판매가 + 받은 배송비 − 수수료)" />
        <Line label="판매가 + 받은 배송비" value={r.revenue} kind="sub" />
        <Line label="판매 수수료" value={-r.fee} kind="sub" />
        <Gap />
        <Line label="나간 돈" value={r.outAll} op="−" tip="지출 장부 전부 (장비 · 필라멘트 포함, 산 날)" />
        {cats.length ? (
          cats.map((c) => <Line key={c.key} label={c.label} value={r.byCat[c.key]} kind="sub" />)
        ) : (
          <Line label="지출 없음" value={0} kind="sub" />
        )}
        <Line label="남은 돈" value={r.cash} kind="final" signed />
      </tbody>
    </table>
  )
}

// 두 기준 차이 (PL-05): 같은 기간인데 왜 다른지 — 장비 + (필라멘트 산 돈 − 뜯은 스풀) + (부속품 · 포장재 산 돈 − 쓴 만큼)
function DiffBox({ r }: { r: PlResult }) {
  const fil = r.filBuy - r.spool
  const part = r.partBuy - r.partUsed
  return (
    <div className="pl-diff">
      <h4>
        두 기준 차이
        <Help tip="같은 기간인데 현금 기준과 손익 기준이 다른 이유. 돈이 나간 달과 실제로 쓴 달이 달라서 생겨요" />
      </h4>
      <div className="row">
        <span>현금 기준 남은 돈</span>
        <span>{signedWon(r.cash)}</span>
      </div>
      <div className="row">
        <span>손익 기준 순이익</span>
        <span>{signedWon(r.net)}</span>
      </div>
      <div className="row">
        <span>· 장비 구매 (손익에서는 투자 회수로)</span>
        <span>{r.invest ? '−' + signedWon(r.invest) : '-'}</span>
      </div>
      <div className="row">
        <span>
          · 필라멘트 산 돈 {signedWon(r.filBuy)} − 뜯은 스풀 {signedWon(r.spool)}
        </span>
        <span>{fil ? (fil > 0 ? '−' : '+') + signedWon(Math.abs(fil)) : '-'}</span>
      </div>
      <div className="row">
        <span>
          · 부속품 · 포장재 산 돈 {signedWon(r.partBuy)} − 쓴 만큼 {signedWon(r.partUsed)}
        </span>
        <span>{part ? (part > 0 ? '−' : '+') + signedWon(Math.abs(part)) : '-'}</span>
      </div>
    </div>
  )
}

// 월별 그래프 (PL-04). 손익 기준: 매출 · 비용 막대 + 순이익 점 / 현금 기준: 들어온 · 나간 막대 + 누적 잔액 선
function Chart(props: {
  cols: ReturnType<typeof chartCols>
  basis: Basis
  selected: string | null
  onMonth: (m: string) => void
}) {
  const { cols, basis, selected, onMonth } = props
  const isPL = basis === 'pl'
  const W = 640
  const H = 300
  const L = 54
  const R = 10
  const T = 22
  const B = 46
  const vals = cols.flatMap((c) => [c.a, c.b, c.v, isPL ? 0 : c.acc])
  const step = niceStep((Math.max(...vals, 1) - Math.min(...vals, 0)) / 4)
  const max = Math.ceil(Math.max(...vals, 1) / step) * step
  const min = Math.floor(Math.min(...vals, 0) / step) * step
  const y = (v: number) => T + ((max - v) / (max - min)) * (H - T - B)
  const cw = (W - L - R) / Math.max(1, cols.length)
  const bw = Math.min(22, cw / 3.2)
  const ticks: number[] = []
  for (let v = min; v <= max + 1; v += step) ticks.push(v)
  const cx = (i: number) => L + cw * i + cw / 2
  const pts = cols.map((c, i) => [cx(i), y(isPL ? c.v : c.acc)])
  // 여러 해에 걸치면 달 이름에 해를 붙임 ("26.5")
  const multiYear = cols.length > 0 && cols[0].month.slice(0, 4) !== cols[cols.length - 1].month.slice(0, 4)
  const mLabel = (m: string) => (multiYear ? `${m.slice(2, 4)}.${Number(m.slice(5))}` : `${Number(m.slice(5))}월`)

  return (
    <>
      <svg className="pl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월별 그래프">
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">
              {manText(v)}
            </text>
          </g>
        ))}
        <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />
        {cols.map((c, i) => (
          <g key={c.month} className={c.month === selected ? 'col sel' : 'col'} onClick={() => onMonth(c.month)}>
            <rect className="hit" x={L + cw * i + 2} y={T - 16} width={cw - 4} height={H - T - B + 34} rx={6} />
            <rect className="in" x={cx(i) - bw - 1} y={y(c.a)} width={bw} height={Math.max(0, y(0) - y(c.a))} rx={3}>
              <title>
                {isPL ? '매출' : '들어온 돈'} {signedWon(c.a)}
              </title>
            </rect>
            <rect className="out" x={cx(i) + 1} y={y(c.b)} width={bw} height={Math.max(0, y(0) - y(c.b))} rx={3}>
              <title>
                {isPL ? '비용' : '나간 돈'} {signedWon(c.b)}
              </title>
            </rect>
            <text x={cx(i)} y={H - B + 18} textAnchor="middle">
              {mLabel(c.month)}
            </text>
            <text className={c.v < 0 ? 'val neg' : 'val'} x={cx(i)} y={H - B + 34} textAnchor="middle">
              {manText(c.v)}
            </text>
          </g>
        ))}
        {!isPL && <polyline className="line" points={pts.map((p) => p.join(',')).join(' ')} />}
        {cols.map((c, i) => {
          const v = isPL ? c.v : c.acc
          return (
            <circle
              key={c.month}
              className={v < 0 ? 'dot neg' : 'dot'}
              cx={pts[i][0]}
              cy={pts[i][1]}
              r={isPL ? 4 : 3.5}
            >
              <title>
                {isPL ? '순이익' : '누적 잔액'} {signedWon(v)}
              </title>
            </circle>
          )
        })}
      </svg>
      <div className="pl-legend">
        <span>
          <i className="in" />
          {isPL ? '매출' : '들어온 돈'}
        </span>
        <span>
          <i className="out" />
          {isPL ? '비용 (재료비 + 운영비 + 세금)' : '나간 돈 (장비 포함)'}
        </span>
        <span>
          <i className={isPL ? 'dot' : 'ln'} />
          {isPL ? '순이익 (아래 숫자)' : '누적 잔액 · 아래 숫자는 그 달 남은 돈'}
        </span>
      </div>
    </>
  )
}
