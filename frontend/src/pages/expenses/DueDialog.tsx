import { useState } from 'react'
import { createExpenses, useRefreshExpenses } from '../../api/expenses'
import Dialog from '../../components/Dialog'
import { useToast } from '../../components/useToast'
import { dotDate, won } from '../../format'
import { amount } from '../../validation'
import { categoryInfo } from './categories'
import type { Due } from './expenseList'

interface Props {
  due: Due[] // 결제일이 지났는데 아직 안 넣은 반복 지출 × 달
  onClose: () => void
}

// 반복 지출 넣기 (EXP-04, docs/screens.md 5.5): 반복 지출 × 달마다 한 줄. 체크 · 그 달 금액 고치기 → 한 번에 넣기
// 지난달을 놓친 것도 그 달 결제일로 넣는다. 금액을 고쳐도 반복 지출의 금액은 그대로 (그 달만)
export default function DueDialog({ due, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const [off, setOff] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(due.map((d) => [d.key, String(d.recurring.amount)])),
  )
  const [busy, setBusy] = useState(false)

  const picked = due.filter((d) => !off.has(d.key))
  const parsed = Object.fromEntries(due.map((d) => [d.key, amount.safeParse(amounts[d.key])]))
  const total = picked.reduce((a, d) => a + (parsed[d.key].success ? (parsed[d.key].data as number) : 0), 0)
  const toggle = (key: string) =>
    setOff((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const save = async () => {
    if (!picked.length || picked.some((d) => !parsed[d.key].success)) return
    setBusy(true)
    try {
      await createExpenses(
        picked.map(({ key, recurring: r, date }) => ({
          date,
          name: r.name,
          category: r.category,
          amount: parsed[key].data as number,
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
      title="반복 지출 넣기"
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
        넣을 것만 체크하세요. 그 달 금액이 다르면 고쳐서 넣어요 (반복 지출 금액은 그대로).
      </p>
      {due.map(({ key, recurring: r, date }) => {
        const p = parsed[key]
        const changed = p.success && p.data !== r.amount
        return (
          <div key={key} className={off.has(key) ? 'due-row off' : 'due-row'}>
            <input
              type="checkbox"
              checked={!off.has(key)}
              aria-label={`${r.name} ${date}`}
              onChange={() => toggle(key)}
            />
            <span>
              <b>{r.name}</b> <span className="cat">{categoryInfo(r.category).label}</span>
              <span className="hint">{dotDate(date)}</span>
            </span>
            <span className="hint num">평소 {won(r.amount)}</span>
            <span>
              <span className="with-suffix">
                <input
                  inputMode="numeric"
                  aria-label={`${r.name} ${date} 금액`}
                  value={amounts[key]}
                  disabled={off.has(key)}
                  onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))}
                />
                <em>원</em>
              </span>
              {!p.success && !off.has(key) ? (
                <span className="err">{p.error.issues[0].message}</span>
              ) : (
                changed && <span className="changed">이 달만 다른 금액</span>
              )}
            </span>
          </div>
        )
      })}
    </Dialog>
  )
}
