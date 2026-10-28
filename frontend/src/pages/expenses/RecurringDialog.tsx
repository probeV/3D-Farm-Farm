import { useState } from 'react'
import { deleteRecurring, useRefreshExpenses, type RecurringExpense } from '../../api/expenses'
import Dialog from '../../components/Dialog'
import Help from '../../components/Help'
import ManageColumn from '../../components/ManageColumn'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { won } from '../../format'
import { categoryInfo } from './categories'
import RecurringFormDialog from './RecurringFormDialog'

const HELP =
  "매달 같은 금액이 나가는 것(구독 · 월정액). 등록해 두면 결제일이 지난 달마다 '확인하고 넣기'로 지출 목록에 들어가요. " +
  '저절로 넣지는 않아요. 그만 낼 때는 삭제하세요 — 이미 넣은 지출은 목록에 그대로 남아요. 다시 내게 되면 새로 등록하면 돼요.'

interface Props {
  recurring: RecurringExpense[] // 결제일순
  onClose: () => void
}

// 반복 지출 관리 (EXP-04, docs/screens.md 5.4). 해지 달은 두지 않고, 그만 낼 때는 삭제
export default function RecurringDialog({ recurring, onClose }: Props) {
  const refresh = useRefreshExpenses()
  const toast = useToast()
  const confirm = useConfirm()
  // 겹쳐 여는 추가 · 수정 창. null = 추가
  const [editing, setEditing] = useState<RecurringExpense | null | undefined>(undefined)

  const remove = async (r: RecurringExpense) => {
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
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Dialog title="반복 지출 관리" size="wide" fixed onClose={onClose}>
        <ManageColumn
          title={
            <>
              반복 지출
              <Help tip={HELP} down />
            </>
          }
          count={recurring.length}
          addLabel="+ 반복 지출 추가"
          onAdd={() => setEditing(null)}
        >
          {recurring.length > 0 && (
            <p className="hint rec-total">매달 {won(recurring.reduce((a, r) => a + r.amount, 0))}</p>
          )}
          {recurring.length ? (
            recurring.map((r) => (
              <div key={r.id} className="row-item rec-row">
                <div>
                  <strong>{r.name}</strong> <span className="cat">{categoryInfo(r.category).label}</span>
                  <div className="hint">
                    매달 {r.day}일 · {r.start.slice(0, 7).replace('-', '.')}부터 · 넣은 지출 {r.expense_count}건
                  </div>
                </div>
                <div className="price">{won(r.amount)}</div>
                <div className="row-btns">
                  <button type="button" className="btn small" onClick={() => setEditing(r)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="반복 지출 삭제 (이미 넣은 지출은 그대로)"
                    onClick={() => remove(r)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="hint">등록된 반복 지출이 없어요.</p>
          )}
        </ManageColumn>
      </Dialog>
      {/* 겹쳐 여는 창은 관리 창 안이 아니라 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {editing !== undefined && <RecurringFormDialog recurring={editing} onClose={() => setEditing(undefined)} />}
    </>
  )
}
