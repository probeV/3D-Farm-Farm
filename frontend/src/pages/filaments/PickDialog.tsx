import { useState } from 'react'
import { useSpools, type Color, type Spool } from '../../api/filaments'
import Dialog from '../../components/Dialog'
import Pager, { PAGE_SIZE } from '../../components/Pager'
import { dateText } from '../../format'
import { useSpoolActions } from './spoolActions'
import { STATUS_LABEL } from './stock'
import Swatch from './Swatch'

// 사용 시작할 / 사용 완료할 스풀을 코드로 직접 선택 (PRD INV-03). 줄을 누르면 바로 처리하고 닫힘
export default function PickDialog({
  color,
  mode,
  onClose,
}: {
  color: Color
  mode: 'open' | 'finish'
  onClose: () => void
}) {
  const from = mode === 'open' ? 'sealed' : 'open'
  const to = mode === 'open' ? 'open' : 'empty'
  const spools = useSpools(color.id, from)
  const actions = useSpoolActions()
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)

  const list = spools.data ?? []
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const pick = async (spool: Spool) => {
    if (busy) return
    setBusy(true)
    try {
      await actions.changeStatus(color, spool, to)
      onClose()
    } catch (e) {
      actions.fail(e)
      setBusy(false)
    }
  }

  return (
    <Dialog
      size="narrow"
      title={
        <>
          <Swatch hex={color.hex} /> {color.name} · {mode === 'open' ? '사용 시작할' : '사용 완료할'} 스풀 선택
        </>
      }
      onClose={onClose}
    >
      <div className="picker-list">
        {spools.isPending && <p className="hint">불러오는 중…</p>}
        {spools.isSuccess && !list.length && <p className="hint">{STATUS_LABEL[from]} 스풀이 없어요.</p>}
        {rows.map((s) => (
          <button key={s.id} type="button" className="pick" disabled={busy} onClick={() => pick(s)}>
            <span>
              <code>{s.code}</code>{' '}
              <small className="muted">
                {mode === 'open' ? `구매 ${s.purchased_at}` : `사용 시작 ${dateText(s.opened_at)}`}
              </small>
            </span>
            <strong>{STATUS_LABEL[to]}</strong>
          </button>
        ))}
      </div>
      <Pager page={current} pages={pages} onPage={setPage} />
    </Dialog>
  )
}
