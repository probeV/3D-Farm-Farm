import {
  createExpense,
  deleteExpense,
  updateExpense,
  useRefreshExpenses,
  type Expense,
  type ExpenseCategory,
  type RecurringExpense,
} from '../../api/expenses'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { dotDate, today, won } from '../../format'
import { useForm } from '../../useForm'
import CategoryPick from './CategoryPick'
import { expenseSchema } from './schemas'

interface Props {
  expense: Expense | null // null 이면 추가
  copyOf?: Expense // 복제할 지출 (값만 복사, 날짜는 오늘, 반복 지출 연결은 복사하지 않음)
  recurring: RecurringExpense[] // 머리에 `↻ 반복 지출 · 이름` 표시용
  shops: string[] // 구매처 입력 도움 (지금까지 쓴 구매처)
  onCopy: (expense: Expense) => void
  onClose: () => void
}

// 지출 추가 · 복제 · 수정 (EXP-02, docs/screens.md 5.3). 삭제는 그것만 지워져서 확인 한 번
export default function ExpenseDialog({ expense, copyOf, recurring, shops, onCopy, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const confirm = useConfirm()
  const src = expense ?? copyOf
  const { values, errors, busy, change, submit } = useForm(expenseSchema, {
    date: expense?.date ?? today(),
    name: src?.name ?? '',
    category: (src?.category ?? '') as ExpenseCategory | '',
    amount: src ? String(src.amount) : '',
    shop: src?.shop ?? '',
    url: src?.url ?? '',
    note: src?.note ?? '',
  })
  const rec = expense?.recurring != null ? recurring.find((r) => r.id === expense.recurring) : undefined

  const save = () =>
    submit(async (data) => {
      // 수정할 때 반복 지출 연결은 그대로 둔다 (보내지 않음)
      if (expense) await updateExpense(expense.id, data)
      else await createExpense({ ...data, recurring: null })
      await refresh()
      toast('저장했어요')
      onClose()
    })

  const remove = async () => {
    if (
      !expense ||
      !(await confirm({
        title: '지출 삭제',
        message: `${expense.name} (${dotDate(expense.date)} · ${won(expense.amount)}) 을(를) 삭제할까요?`,
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
          <CategoryPick value={values.category} onChange={(v) => change('category', v)} showInfo />
          {errors.category && <span className="err">{errors.category}</span>}
        </div>
        <Field label="구매처" error={errors.shop}>
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
        <Field label="주문 링크" error={errors.url}>
          <input
            type="url"
            value={values.url}
            placeholder="https://… 주문 내역"
            onChange={(e) => change('url', e.target.value)}
          />
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
