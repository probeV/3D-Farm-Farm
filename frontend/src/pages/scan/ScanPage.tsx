import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { getScanSpool, updateSpool, type ScanSpool, type SpoolStatus } from '../../api/filaments'
import { dateText, dotDate, today, won } from '../../format'
import { STATUS_LABEL } from '../filaments/stock'

// 상태마다 큰 버튼 하나 + 되돌리기 링크 (사용 완료는 조회만, 되돌리기만)
const NEXT: Record<SpoolStatus, [SpoolStatus, string] | null> = {
  sealed: ['open', '사용 시작'],
  open: ['empty', '사용 완료'],
  empty: null,
}
const BACK: Record<SpoolStatus, [SpoolStatus, string] | null> = {
  sealed: null,
  open: ['sealed', '재고로 되돌리기'],
  empty: ['open', '사용 중으로 되돌리기'],
}
const DONE: Record<SpoolStatus, string> = {
  open: '사용 시작으로 바꿨어요',
  empty: '사용 완료로 바꿨어요',
  sealed: '재고로 되돌렸어요',
}

// 폰 스풀 화면 (v2 TBD-18, docs/screens.md 1.11): QR 라벨을 폰 기본 카메라로 찍으면 열리는 {PUBLIC_URL}/s/{코드}.
// 사이드바 없이 이 스풀 하나 — 상태 바꾸기 전용 (등록 · 정보 고치기는 PC 에서). 상태는 버튼을 눌러야 바뀐다
export default function ScanPage({ code }: { code: string }) {
  const spool = useQuery({ queryKey: ['scan', code], queryFn: () => getScanSpool(code), retry: false })
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = `${code.toUpperCase()} · 3D Farm Farm`
  }, [code])

  const change = async (s: ScanSpool, to: SpoolStatus) => {
    setBusy(true)
    setError('')
    try {
      await updateSpool(s.id, { status: to })
      await spool.refetch()
      setDone(s.status === 'empty' && to === 'open' ? '사용 중으로 되돌렸어요' : DONE[to])
    } catch (e) {
      setDone('')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 지운 스풀(404) · 형식이 틀린 코드(400)는 등록된 스풀이 아님. 그 밖(서버 꺼짐 등)은 다시 시도
  const notFound = spool.error instanceof ApiError && [400, 404].includes(spool.error.status)

  return (
    <div className="scan">
      <div className="scan-top">
        <span className="mark">3D</span>3D Farm Farm · 스풀
      </div>
      {done && <div className="scan-done">✓ {done}</div>}
      {error && <div className="scan-err small">{error}</div>}
      {spool.data ? (
        <SpoolView spool={spool.data} busy={busy} onChange={(to) => change(spool.data, to)} />
      ) : notFound ? (
        <>
          <div className="scan-code">{code.toUpperCase()}</div>
          <div className="scan-err">
            등록된 스풀이 아니에요.
            <span>지운 스풀의 라벨이거나 잘못 찍혔을 수 있어요. 라벨은 떼서 버려도 돼요.</span>
          </div>
        </>
      ) : spool.isError ? (
        <div className="scan-err">
          불러오지 못했어요: {spool.error.message}
          <button type="button" className="btn" onClick={() => spool.refetch()}>
            다시 시도
          </button>
        </div>
      ) : (
        <div className="hint">불러오는 중…</div>
      )}
    </div>
  )
}

function SpoolView({
  spool,
  busy,
  onChange,
}: {
  spool: ScanSpool
  busy: boolean
  onChange: (to: SpoolStatus) => void
}) {
  const next = NEXT[spool.status]
  const back = BACK[spool.status]
  return (
    <>
      <div className="scan-head">
        <div className="scan-code">{spool.code}</div>
        <span className={`status-tag s-${spool.status}`}>{STATUS_LABEL[spool.status]}</span>
      </div>
      <div className="scan-card">
        <div className="scan-color">
          <span className="sw" style={{ background: spool.color_hex }} />
          <div>
            <div className="nm">{spool.color_name}</div>
            <div className="sub">{spool.filament_name}</div>
          </div>
        </div>
        <dl className="scan-meta">
          <dt>구매가</dt>
          <dd>{won(spool.price)}</dd>
          <dt>구매일</dt>
          <dd>
            {dotDate(spool.purchased_at)}
            {spool.order && <span className="hint"> · {spool.order.name}</span>}
          </dd>
          {spool.opened_at && (
            <>
              <dt>사용 시작</dt>
              <dd>{dotDate(dateText(spool.opened_at))}</dd>
            </>
          )}
          {spool.finished_at && (
            <>
              <dt>사용 완료</dt>
              <dd>{dotDate(dateText(spool.finished_at))}</dd>
            </>
          )}
        </dl>
      </div>
      {next ? (
        <>
          <button type="button" className="btn primary scan-big" disabled={busy} onClick={() => onChange(next[0])}>
            {next[1]}
          </button>
          <div className="hint center">오늘({dotDate(today())}) 날짜로 기록돼요</div>
        </>
      ) : (
        <div className="hint center">다 쓴 스풀이에요. 라벨은 떼서 버려도 돼요.</div>
      )}
      {back && (
        <div className="scan-links">
          <button type="button" disabled={busy} onClick={() => onChange(back[0])}>
            {back[1]}
          </button>
        </div>
      )}
    </>
  )
}
