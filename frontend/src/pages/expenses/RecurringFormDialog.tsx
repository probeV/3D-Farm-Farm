import {
  createRecurring,
  deleteRecurring,
  updateRecurring,
  useRefreshExpenses,
  type ExpenseCategory,
  type RecurringExpense,
} from '../../api/expenses'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { today } from '../../format'
import { useForm } from '../../useForm'
import CategoryPick from './CategoryPick'
import { recurringSchema } from './schemas'

interface Props {
  recurring: RecurringExpense | null // null 이면 추가
  onClose: () => void
}

// 반복 지출 추가 · 수정 (EXP-04). 금액을 바꾸면 다음에 넣는 달부터 바뀐 금액 (이미 넣은 지출은 그대로)
export default function RecurringFormDialog({ recurring: r, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const confirm = useConfirm()
  const { values, errors, busy, change, submit } = useForm(recurringSchema, {
    name: r?.name ?? '',
    category: (r?.category ?? 'sub') as ExpenseCategory | '',
    amount: r ? String(r.amount) : '',
    day: String(r?.day ?? 1),
    start: (r?.start ?? today()).slice(0, 7),
    note: r?.note ?? '',
  })

  const save = () =>
    submit(async (data) => {
      if (r) await updateRecurring(r.id, data)
      else await createRecurring(data)
      await refresh()
      toast('저장했어요')
      onClose()
    })

  // 그만 낼 때는 삭제. 이미 넣은 지출은 남는다 (그것만 지워지는 삭제라 확인 한 번)
  const remove = async () => {
    if (!r) return
    const ok = await confirm({
      title: '반복 지출 삭제',
      message: (
        <>
          {r.name} 을(를) 삭제할까요?
          <br />
          <span className="hint">
            다음 달부터 알림이 뜨지 않아요.
            {r.expense_count > 0 && ` 이미 넣은 지출 ${r.expense_count}건은 목록에 그대로 남아요.`}
          </span>
        </>
      ),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteRecurring(r.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      footerLeft={
        r && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
      title={r ? '반복 지출 수정' : '반복 지출 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
    >
      <div className="form-grid">
        <Field label="이름 *" error={errors.name} full>
          <input
            value={values.name}
            placeholder="예: AI 구독"
            data-autofocus
            onChange={(e) => change('name', e.target.value)}
          />
        </Field>
        <Field label="금액 *" error={errors.amount}>
          <div className="with-suffix">
            <input inputMode="numeric" value={values.amount} onChange={(e) => change('amount', e.target.value)} />
            <em>원</em>
          </div>
        </Field>
        <Field label="결제일 *" error={errors.day} hint="그 달 말일보다 크면 말일로 넣어요">
          <div className="with-suffix">
            <em>매달</em>
            <input inputMode="numeric" value={values.day} onChange={(e) => change('day', e.target.value)} />
            <em>일</em>
          </div>
        </Field>
        <div className="field full">
          <span>분류 *</span>
          <CategoryPick value={values.category} onChange={(v) => change('category', v)} />
          {errors.category && <span className="err">{errors.category}</span>}
        </div>
        <Field label="시작 달 *" error={errors.start}>
          <input type="month" value={values.start} onChange={(e) => change('start', e.target.value)} />
        </Field>
        <Field label="메모" error={errors.note}>
          <input value={values.note} onChange={(e) => change('note', e.target.value)} />
        </Field>
      </div>
      {r && (
        <p className="hint" style={{ margin: '12px 0 0' }}>
          금액을 바꾸면 다음에 넣는 달부터 바뀐 금액으로 들어가요. 이미 넣은 지출은 그대로예요.
        </p>
      )}
    </Dialog>
  )
}
