import { useState } from 'react'
import { useSpools, type Color, type Spool, type SpoolStatus } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Pager, { PAGE_SIZE } from '../../../components/Pager'
import { useToast } from '../../../components/useToast'
import { dateText } from '../../../format'
import { money } from '../../../validation'
import { useSpoolActions } from './spoolActions'
import { STATUSES, STATUS_LABEL } from '../stock'
import Swatch from '../Swatch'

type View = 'simple' | 'detail'

// 스풀 조정 (PRD INV-04 · INV-05, docs/screens.md 1.9)
// 간단: 구매가 · 상태 버튼 / 세부: 날짜 · 구매가 · 삭제. 상태를 바꿔도 창은 열린 채 같은 페이지에 머문다
export default function AdjustDialog({ color, onClose }: { color: Color; onClose: () => void }) {
  const spools = useSpools(color.id)
  const actions = useSpoolActions()
  const toast = useToast()
  const [view, setView] = useState<View>('simple')
  const [page, setPage] = useState(1)

  const list = spools.data ?? []
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages) // 지워서 마지막 페이지가 없어지면 앞 페이지로
  const rows = list.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  // 거꾸로 이동(사용 완료 → 사용 중 등)은 확인 후 실행 (PRD INV-07)
  const changeStatus = (s: Spool, to: SpoolStatus) => {
    const backwards = STATUSES.indexOf(to) < STATUSES.indexOf(s.status)
    const msg = `${color.name} ${s.code}\n${STATUS_LABEL[s.status]} → ${STATUS_LABEL[to]}(으)로 되돌릴까요?`
    if (backwards && !confirm(msg)) return
    actions.changeStatus(color, s, to).catch(actions.fail)
  }
  const remove = (s: Spool) => {
    if (!confirm(`${color.name} ${s.code} 스풀 기록을 삭제할까요?`)) return
    actions.remove(s).catch(actions.fail)
  }
  const setPrice = (s: Spool, price: number | null) => actions.setPrice(s, price).catch(actions.fail)

  const tabs = (
    <div className="view-tabs">
      {(['simple', 'detail'] as const).map((v) => (
        <button key={v} type="button" className={v === view ? 'active' : ''} onClick={() => setView(v)}>
          {v === 'simple' ? '간단' : '세부'}
        </button>
      ))}
    </div>
  )

  return (
    <Dialog
      size="wide"
      title={
        <>
          <Swatch hex={color.hex} /> {color.name} · 스풀 조정{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            ({list.length}개)
          </span>
        </>
      }
      headExtra={tabs}
      onClose={onClose}
    >
      {view === 'simple' ? (
        <div className="spool-row simple head">
          <span>스풀 / 구매일</span>
          <span>구매가</span>
          <span>상태</span>
        </div>
      ) : (
        <div className="spool-row detail head">
          <span>스풀</span>
          <span>상태</span>
          <span>구매일</span>
          <span className="d-open">사용 시작일</span>
          <span className="d-empty">사용 완료일</span>
          <span>구매가</span>
          <span />
        </div>
      )}
      <div className="picker-list">
        {spools.isPending && <p className="hint">불러오는 중…</p>}
        {rows.map((s) =>
          view === 'simple' ? (
            <div key={s.id} className="spool-row simple">
              <div className="spool-id">
                <code>{s.code}</code>
                <small className="muted">{s.purchased_at}</small>
              </div>
              <PriceInput spool={s} onSave={setPrice} onInvalid={toast} />
              <div className="status-btns">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={st === s.status ? 'current' : ''}
                    disabled={st === s.status}
                    onClick={() => changeStatus(s, st)}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div key={s.id} className="spool-row detail">
              <code>{s.code}</code>
              <span className={`status-tag s-${s.status}`}>{STATUS_LABEL[s.status]}</span>
              <span>{s.purchased_at}</span>
              <span className="d-open">{dateText(s.opened_at)}</span>
              <span className="d-empty">{dateText(s.finished_at)}</span>
              <PriceInput spool={s} onSave={setPrice} onInvalid={toast} />
              <button type="button" className="icon-btn" title="스풀 기록 삭제" onClick={() => remove(s)}>
                ✕
              </button>
            </div>
          ),
        )}
      </div>
      <Pager page={current} pages={pages} onPage={setPage} />
    </Dialog>
  )
}

interface PriceInputProps {
  spool: Spool
  onSave: (s: Spool, price: number | null) => void
  onInvalid: (message: string) => void
}

// 구매가: 입력을 마치면(칸을 벗어나거나 Enter) 바로 저장. 비우면 미입력(null)
// 검사는 재고 추가 창과 같은 money 규칙. 줄 안에 오류 글씨 자리가 없어서, 틀리면 원래 값으로 되돌리고 알림으로 표시
function PriceInput({ spool, onSave, onInvalid }: PriceInputProps) {
  return (
    <div className="with-suffix price-cell">
      <input
        // 서버 값이 바뀌면(되돌리기 등) 입력칸도 새 값으로
        key={spool.price ?? 'none'}
        inputMode="numeric"
        defaultValue={spool.price ?? ''}
        placeholder="미입력"
        onBlur={(e) => {
          const input = e.target
          const r = money.safeParse(input.value)
          if (!r.success) {
            input.value = spool.price == null ? '' : String(spool.price)
            onInvalid(`${spool.code} 구매가: ${r.error.issues[0].message}`)
            return
          }
          if (r.data !== spool.price) onSave(spool, r.data)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          e.currentTarget.blur()
        }}
      />
      <em>원</em>
    </div>
  )
}
