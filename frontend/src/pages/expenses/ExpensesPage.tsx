import { useCallback, useState } from 'react'
import { useExpenses, useRecurringExpenses, type Expense, type ExpenseCategory } from '../../api/expenses'
import Help from '../../components/Help'
import SortTh from '../../components/SortTh'
import { downloadText } from '../../csv'
import { dotDate, today, won } from '../../format'
import { nextSort } from '../../sort'
import { buyMark } from './buyRows'
import { CATEGORIES, categoryInfo } from './categories'
import DueDialog from './DueDialog'
import ExpenseDialog from './ExpenseDialog'
import {
  byCategory,
  dueRecurring,
  expensesCsv,
  filterExpenses,
  inPeriod,
  NO_FILTER,
  PERIODS,
  periodLabel,
  SORT_COLUMNS,
  summarize,
  type ListFilter,
  type Period,
  type Sort,
} from './expenseList'
import RecurringDialog from './RecurringDialog'

type DialogState = { kind: 'expense'; id: number | null; copyOf?: Expense } | { kind: 'recurring' } | { kind: 'due' }

// 지출 화면: 요약 카드 → (넣을 반복 지출 알림) → 분류별 합계 → 지출 목록 (docs/screens.md 5장)
export default function ExpensesPage() {
  const expenses = useExpenses()
  const recurring = useRecurringExpenses()
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  const error = expenses.error ?? recurring.error
  if (error) {
    return (
      <div className="empty">
        불러오지 못했어요: {error.message}{' '}
        <button
          className="btn small"
          onClick={() => {
            expenses.refetch()
            recurring.refetch()
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (!expenses.data || !recurring.data) return <div className="empty">불러오는 중…</div>

  const all = expenses.data
  const recs = recurring.data
  const now = today()
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const sum = summarize(all, now)
  const due = dueRecurring(recs, all, now)
  const cats = byCategory(all.filter((x) => inPeriod(x.date, filter, now)))
  const maxCat = Math.max(1, ...cats.map((c) => c.amount))
  const list = filterExpenses(all, filter, now)
  const listTotal = list.reduce((a, x) => a + x.amount, 0)
  const filtered = filter.q !== '' || filter.category !== '' || filter.period !== 'all'
  const shops = [...new Set(all.map((x) => x.shop).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
  const th = {
    sort: filter.sort,
    onSort: (key: Sort['key']) => set({ sort: nextSort(SORT_COLUMNS, filter.sort, key) }),
  }

  return (
    <>
      <div className="top-row">
        <span className="hint">
          장비 · 재료 · 구독 등 사업에 쓴 돈. 필라멘트 · 부속품 · 포장재 · 소모품은 산 것을 적으면 재고로 이어져요.
        </span>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog({ kind: 'recurring' })}>
          반복 지출 관리
        </button>
        <button className="btn primary" onClick={() => setDialog({ kind: 'expense', id: null })}>
          + 지출 추가
        </button>
      </div>

      <div className="sum-cards">
        <div className="sum-card invest">
          <span>
            누적 투자금
            <Help tip="장비 분류의 지출 합계 · 전체 기간. v2 에서 투자 회수율의 기준이 돼요" />
          </span>
          <strong>{won(sum.invest)}</strong>
          <span className="sub">장비 {sum.investCount}건</span>
        </div>
        <div className="sum-card">
          <span>
            누적 지출
            <Help tip="모든 분류의 지출 합계 · 전체 기간" />
          </span>
          <strong>{won(sum.total)}</strong>
          <span className="sub">
            {sum.count}건{sum.since && ` · ${dotDate(sum.since)}부터`}
          </span>
        </div>
        <div className="sum-card">
          <span>
            이번 달 지출
            <Help tip={`${now.slice(0, 4)}년 ${Number(now.slice(5, 7))}월 · 모든 분류`} />
          </span>
          <strong>{won(sum.thisMonth)}</strong>
          <span className="sub">{sum.thisMonthCount}건</span>
        </div>
      </div>

      {due.length > 0 && (
        <div className="due">
          <span>
            결제일이 지난 반복 지출 <b>{due.length}건</b>을 아직 넣지 않았어요 · {due.map((r) => r.name).join(', ')} (
            {won(due.reduce((a, r) => a + r.amount, 0))})
          </span>
          <div className="spacer" />
          <button className="btn small primary" onClick={() => setDialog({ kind: 'due' })}>
            확인하고 넣기
          </button>
        </div>
      )}

      <div className="by-cat">
        <div className="by-cat-head">
          <h4>분류별 합계</h4>
          <span className="hint">{periodLabel(filter)} · 누르면 그 분류만 보기</span>
        </div>
        <div className="by-cat-grid">
          {cats.map((c) => (
            <button
              key={c.key}
              type="button"
              className={['cat-row', c.amount ? '' : 'zero', filter.category === c.key ? 'active' : ''].join(' ')}
              data-cat={c.key}
              title={c.examples}
              onClick={() => set({ category: filter.category === c.key ? '' : c.key })}
            >
              <span>{c.label}</span>
              <span className="bar">
                <i style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </span>
              <span className="amt">{c.amount ? won(c.amount) : '-'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-head list-toolbar">
        <h3>지출 목록</h3>
        <span className="hint">{list.length}건</span>
        <span className="list-total">{won(listTotal)}</span>
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
        <select value={filter.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory | '' })}>
          <option value="">분류: 전체</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="항목 · 구매처 · 메모 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        {filtered && (
          <button className="btn small" onClick={() => set({ q: '', category: '', period: 'all', from: '', to: '' })}>
            필터 지우기
          </button>
        )}
        <button
          className="btn small"
          title="보이는 목록을 엑셀용 CSV 로"
          disabled={!list.length}
          onClick={() => downloadText(`지출_${now}.csv`, expensesCsv(list, recs))}
        >
          CSV 내보내기
        </button>
      </div>

      {list.length ? (
        <div className="table-wrap">
          <table className="expenses-table">
            <thead>
              <tr>
                <SortTh sortKey="date" {...th}>
                  날짜
                </SortTh>
                <SortTh sortKey="name" {...th}>
                  항목
                </SortTh>
                <SortTh sortKey="category" {...th}>
                  분류
                </SortTh>
                <SortTh sortKey="shop" {...th}>
                  구매처
                </SortTh>
                <SortTh sortKey="amount" num {...th}>
                  금액
                </SortTh>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} onClick={() => setDialog({ kind: 'expense', id: x.id })}>
                  <td className="date">{dotDate(x.date)}</td>
                  <td className="pname">
                    {x.name}
                    {x.recurring != null && (
                      <span className="rec-mark" title="반복 지출에서 넣은 줄">
                        ↻ 반복
                      </span>
                    )}
                    <BuyMark expense={x} />
                  </td>
                  <td>
                    <span className={x.category === 'invest' ? 'cat invest' : 'cat'}>
                      {categoryInfo(x.category).label}
                    </span>
                  </td>
                  <td>{x.shop || <span className="muted">-</span>}</td>
                  <td className="num amount">{won(x.amount)}</td>
                  <td className="note" title={x.note}>
                    {x.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {all.length ? '조건에 맞는 지출이 없어요.' : '아직 기록한 지출이 없어요. + 지출 추가로 시작하세요.'}
        </div>
      )}

      {dialog?.kind === 'expense' && renderExpense(dialog.id, dialog.copyOf)}
      {dialog?.kind === 'recurring' && <RecurringDialog recurring={recs} onClose={closeDialog} />}
      {dialog?.kind === 'due' && <DueDialog due={due} onClose={closeDialog} />}
    </>
  )

  // 지출이 지워졌으면(다른 창에서) 그리지 않는다. 복제는 새 창으로 바꿔 연다
  function renderExpense(id: number | null, copyOf?: Expense) {
    const expense = id == null ? null : all.find((x) => x.id === id)
    if (expense === undefined) return null
    return (
      <ExpenseDialog
        key={id ?? `new-${copyOf?.id ?? ''}`}
        expense={expense}
        copyOf={copyOf}
        recurring={recs}
        shops={shops}
        onCopy={(x) => setDialog({ kind: 'expense', id: null, copyOf: x })}
        onClose={closeDialog}
      />
    )
  }
}

// 항목 옆 구매 표시 (TBD-31 · 33): 필라멘트 `🧵 6롤` · 품목 `📦 네오디뮴 200개`
function BuyMark({ expense }: { expense: Expense }) {
  const mark = buyMark(expense)
  return mark ? (
    <span className="rec-mark buy" title={mark.title}>
      {mark.text}
    </span>
  ) : null
}
