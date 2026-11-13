import { useState } from 'react'
import {
  createExpense,
  deleteExpense,
  updateExpense,
  useRefreshExpenses,
  type Expense,
  type ExpenseCategory,
  type RecurringExpense,
} from '../../api/expenses'
import { useFilaments } from '../../api/filaments'
import { useParts } from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { dotDate, today, unitWon, won } from '../../format'
import { useForm } from '../../useForm'
import BuyLines, { type BuyColor } from './BuyLines'
import {
  averageEach,
  BUY_KINDS,
  buyField,
  checkRows,
  emptyRow,
  isLatest,
  itemsErrorMessage,
  parseRows,
  rowsOf,
  spoolDiff,
  splitTotals,
  toInput,
  type BuyRow,
} from './buyRows'
import CategoryPick from './CategoryPick'
import { expenseSchema } from './schemas'

interface Props {
  expense: Expense | null // null 이면 추가
  copyOf?: Expense // 복제할 지출 (값만 복사, 날짜는 오늘, 반복 지출 연결은 복사하지 않음)
  recurring: RecurringExpense[] // 머리에 `↻ 반복 지출 · 이름` 표시용
  all: Expense[] // 구매 항목이 그 색상 · 품목의 최근 구매인지 보려고
  shops: string[] // 구매처 입력 도움 (지금까지 쓴 구매처)
  onCopy: (expense: Expense) => void
  onClose: () => void
}

// 지출 추가 · 복제 · 수정 (EXP-02, docs/screens.md 5.3). 삭제는 그것만 지워져서 확인 한 번.
// 분류가 필라멘트 · 부속품 · 포장재 · 소모품이면 구매 항목 (v2 TBD-31 · 33) — 저장하면 스풀 · 남은 수량 · 단가로 이어진다
export default function ExpenseDialog({ expense, copyOf, recurring, all, shops, onCopy, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const confirm = useConfirm()
  const filaments = useFilaments()
  const parts = useParts()
  const src = expense ?? copyOf
  const [rows, setRows] = useState<BuyRow[]>(() => {
    const r = rowsOf(src, !expense)
    return r.length ? r : [emptyRow()]
  })
  const [rowsError, setRowsError] = useState<string | null>(null)
  const { values, errors, busy, change, submit } = useForm(expenseSchema, {
    date: expense?.date ?? today(),
    name: src?.name ?? '',
    category: (src?.category ?? '') as ExpenseCategory | '',
    amount: src ? String(src.amount) : '',
    shop: src?.shop ?? '',
    note: src?.note ?? '',
  })
  const rec = expense?.recurring != null ? recurring.find((r) => r.id === expense.recurring) : undefined
  const field = buyField(values.category)
  const amountNum = Number(values.amount.replace(/,/g, ''))
  const amount = values.amount.trim() && Number.isFinite(amountNum) ? amountNum : null
  const colors: BuyColor[] = (filaments.data ?? []).flatMap((f) =>
    f.colors.map((c) => ({ id: c.id, name: c.name, fil: f.display_name, price: c.spool_price })),
  )
  const kind = values.category ? BUY_KINDS[values.category] : undefined
  const tabParts = (parts.data ?? []).filter((x) => x.kind === kind)

  // 분류를 바꾸면 구매 항목은 새로 (다른 분류의 색상 · 품목은 맞지 않음)
  const changeCategory = (v: ExpenseCategory) => {
    if (buyField(v) !== field || BUY_KINDS[v] !== kind) setRows([emptyRow()])
    setRowsError(null)
    change('category', v)
  }
  const changeRows = (next: BuyRow[]) => {
    setRows(next)
    if (rowsError) setRowsError(checkRows(values.category, amount, next))
  }

  // 저장 알림: `저장했어요 · 스풀 +4개 · 재고 네오디뮴 +200개 · 단가 화이트 18,000원`
  const savedMessage = (date: string) => {
    if (!field) return '저장했어요'
    const parsed = parseRows(rows)
    const avg = averageEach(parsed, splitTotals(values.category, amount ?? 0, parsed))
    const nameOf = (pick: number) =>
      field === 'color'
        ? colors.find((c) => c.id === pick)?.name
        : tabParts.find((x) => x.id === pick)?.name.split(' ')[0]
    const unitOf = (pick: number) => tabParts.find((x) => x.id === pick)?.unit ?? ''
    // 같은 품목 여러 항목은 합쳐서 (저장 전과 비교한 차이)
    const qtyBy = (list: { pick: number; qty: number }[]) =>
      list.reduce((m, x) => m.set(x.pick, (m.get(x.pick) ?? 0) + x.qty), new Map<number, number>())
    const before = qtyBy((expense?.items ?? []).map((it) => ({ pick: (it[field] ?? 0) as number, qty: it.qty })))
    const now = qtyBy(parsed)
    const stock =
      field === 'part'
        ? [...new Set([...now.keys(), ...before.keys()])]
            .map((pick) => [pick, (now.get(pick) ?? 0) - (before.get(pick) ?? 0)] as const)
            .filter(([, n]) => n)
            .map(([pick, n]) => `${nameOf(pick)} ${n > 0 ? '+' : ''}${n}${unitOf(pick)}`)
        : []
    const spool = field === 'color' ? rows.reduce((a, r) => a + (r.pick == null ? -r.was : spoolDiff(r)), 0) : 0
    const price = [...avg]
      .filter(([pick]) => isLatest(all, expense, field, pick, date))
      .map(([pick, each]) => `${nameOf(pick)} ${field === 'color' ? won(each) : unitWon(each)}`)
    const parts = [
      spool > 0 ? `스풀 +${spool}개` : spool < 0 ? `재고 스풀 ${-spool}개 지움` : '',
      stock.length ? `재고 ${stock.join(', ')}` : '',
      price.length ? `단가 ${price.join(', ')}` : '',
    ]
    return ['저장했어요', ...parts.filter(Boolean)].join(' · ')
  }

  const save = () => {
    const problem = field ? checkRows(values.category, amount, rows) : null
    setRowsError(problem)
    return submit(async (data) => {
      if (problem) throw new Error(problem)
      // 구매 항목: 그 분류일 때만, 고른 항목만. 아닌 분류면 빈 목록 (서버가 기존 항목을 지움)
      const items = field ? toInput(field, rows) : []
      try {
        // 수정할 때 반복 지출 연결은 그대로 둔다 (보내지 않음)
        if (expense) await updateExpense(expense.id, { ...data, items })
        else await createExpense({ ...data, recurring: null, items })
      } catch (e) {
        const msg = itemsErrorMessage(e)
        if (msg) {
          setRowsError(msg)
          throw new Error(msg)
        }
        throw e
      }
      const msg = savedMessage(data.date)
      await refresh()
      toast(msg)
      onClose()
    })
  }

  const remove = async () => {
    if (!expense) return
    // 필라멘트: 사용한 스풀이 있으면 지울 수 없음 (서버도 409). 없으면 재고 스풀도 함께 지워짐
    const used = expense.items.reduce((a, it) => a + it.used, 0)
    if (used) return toast(`사용한 스풀 ${used}개가 있어 삭제할 수 없어요`)
    const spools = expense.items.reduce((a, it) => a + it.spools, 0)
    const message = `${expense.name} (${dotDate(expense.date)} · ${won(expense.amount)}) 을(를) 삭제할까요?`
    if (
      !(await confirm({
        title: '지출 삭제',
        message: spools ? `${message} 재고 스풀 ${spools}개도 함께 지워져요.` : message,
        danger: true,
      }))
    )
      return
    try {
      await deleteExpense(expense.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const title = expense ? (
    <>지출 수정 {rec && <span className="badge info">↻ 반복 지출 · {rec.name}</span>}</>
  ) : (
    <>지출 추가 {copyOf && <span className="copy-from">{copyOf.name}에서 복제</span>}</>
  )

  return (
    <Dialog
      title={title}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        expense && (
          <>
            <button type="button" className="btn danger" onClick={remove}>
              삭제
            </button>
            <button type="button" className="btn" onClick={() => onCopy(expense)}>
              복제
            </button>
          </>
        )
      }
    >
      <div className="form-grid">
        <Field label="날짜 *" error={errors.date}>
          <input type="date" value={values.date} max={today()} onChange={(e) => change('date', e.target.value)} />
        </Field>
        <Field label="금액 *" error={errors.amount}>
          <div className="with-suffix">
            <input
              inputMode="numeric"
              value={values.amount}
              placeholder="0"
              onChange={(e) => change('amount', e.target.value)}
            />
            <em>원</em>
          </div>
        </Field>
        <Field label="항목 *" error={errors.name} full>
          <input
            value={values.name}
            placeholder="예: 필라멘트 건조기"
            data-autofocus={expense ? undefined : true}
            onChange={(e) => change('name', e.target.value)}
          />
        </Field>
        {/* 라디오 버튼 묶음이라 label 이 아닌 div (label 안에 label 이 들어가지 않게) */}
        <div className="field full">
          <span>분류 *</span>
          <CategoryPick value={values.category} onChange={changeCategory} />
          {errors.category && <span className="err">{errors.category}</span>}
        </div>
        {field && values.category && (
          <BuyLines
            category={values.category}
            field={field}
            rows={rows}
            amount={amount}
            date={values.date}
            expense={expense}
            all={all}
            colors={colors}
            parts={tabParts}
            error={rowsError}
            onChange={changeRows}
          />
        )}
        <Field label="구매처" error={errors.shop} full>
          <input
            list="expense-shops"
            value={values.shop}
            placeholder="예: 쿠팡"
            onChange={(e) => change('shop', e.target.value)}
          />
          <datalist id="expense-shops">
            {shops.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="메모" error={errors.note} full>
          <textarea
            rows={2}
            value={values.note}
            placeholder="예: 배송비 포함 · 할부 3개월"
            onChange={(e) => change('note', e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  )
}
