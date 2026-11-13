import { useState } from 'react'
import { createExpenses, useRefreshExpenses, type RecurringExpense } from '../../api/expenses'
import Dialog from '../../components/Dialog'
import { useToast } from '../../components/useToast'
import { dotDate, today, won } from '../../format'
import { amount } from '../../validation'
import { categoryInfo } from './categories'
import { payDate } from './expenseList'

interface Props {
  due: RecurringExpense[] // 결제일이 지났는데 이번 달에 안 넣은 반복 지출
  onClose: () => void
}

// 이번 달 반복 지출 넣기 (EXP-04, docs/screens.md 5.5): 줄마다 체크 · 이번 달 금액 고치기 → 한 번에 넣기
// 금액을 고쳐도 반복 지출의 금액은 그대로 (이번 달만). 날짜 = 이번 달 결제일
export default function DueDialog({ due, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const month = today().slice(0, 7)
  const [off, setOff] = useState<Set<number>>(new Set())
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(due.map((r) => [r.id, String(r.amount)])),
  )
  const [busy, setBusy] = useState(false)

  const picked = due.filter((r) => !off.has(r.id))
  const parsed = Object.fromEntries(due.map((r) => [r.id, amount.safeParse(amounts[r.id])]))
  const total = picked.reduce((a, r) => a + (parsed[r.id].success ? (parsed[r.id].data as number) : 0), 0)
  const toggle = (id: number) =>
    setOff((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    if (!picked.length || picked.some((r) => !parsed[r.id].success)) return
    setBusy(true)
    try {
      await createExpenses(
        picked.map((r) => ({
          date: payDate(r, month),
          name: r.name,
          category: r.category,
          amount: parsed[r.id].data as number,
          shop: '',
          note: '',
          recurring: r.id,
        })),
      )
      await refresh()
      toast(`반복 지출 ${picked.length}건을 넣었어요`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={
        <>
          이번 달 반복 지출 넣기 <span className="copy-from">{month.replace('-', '년 ')}월</span>
        </>
      }
      size="wide"
      onClose={onClose}
      submitLabel={`${picked.length}건 넣기`}
      onSubmit={save}
      busy={busy || !picked.length}
      footerLeft={
        <span className="foot-note">
          {picked.length}건 · {won(total)}
        </span>
      }
    >
      <p className="hint" style={{ margin: '0 0 8px' }}>
        넣을 것만 체크하세요. 이번 달 금액이 다르면 고쳐서 넣어요 (반복 지출 금액은 그대로).
      </p>
      {due.map((r) => {
        const p = parsed[r.id]
        const changed = p.success && p.data !== r.amount
        return (
          <div key={r.id} className={off.has(r.id) ? 'due-row off' : 'due-row'}>
            <input type="checkbox" checked={!off.has(r.id)} aria-label={r.name} onChange={() => toggle(r.id)} />
            <span>
              <b>{r.name}</b> <span className="cat">{categoryInfo(r.category).label}</span>
              <span className="hint">{dotDate(payDate(r, month))}</span>
            </span>
            <span className="hint num">평소 {won(r.amount)}</span>
            <span>
              <span className="with-suffix">
                <input
                  inputMode="numeric"
                  aria-label={`${r.name} 금액`}
                  value={amounts[r.id]}
                  disabled={off.has(r.id)}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                />
                <em>원</em>
              </span>
              {!p.success && !off.has(r.id) ? (
                <span className="err">{p.error.issues[0].message}</span>
              ) : (
                changed && <span className="changed">이번 달만 다른 금액</span>
              )}
            </span>
          </div>
        )
      })}
    </Dialog>
  )
}
