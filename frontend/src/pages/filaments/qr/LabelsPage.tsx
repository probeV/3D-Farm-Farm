import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  markLabels,
  useAllSpools,
  useFilaments,
  useLabelInfo,
  useRefreshFilaments,
  type Spool,
} from '../../../api/filaments'
import Help from '../../../components/Help'
import QrCode from '../../../components/QrCode'
import Swatch from '../../../components/Swatch'
import { useToast } from '../../../components/useToast'
import { dotDate } from '../../../format'
import type { LabelPick } from '../../../nav'
import { codesText } from '../spools/spoolActions'
import { STATUS_LABEL } from '../stock'
import {
  A4_PER_PAGE,
  baseUrl,
  chunk,
  initialPick,
  localOnly,
  needsLabel,
  qrUrl,
  search,
  SIZES,
  toRows,
  type LabelSize,
  type Row,
} from './labels'

// 라벨 크기는 이 PC 에 기억 (라벨 프린터를 매번 고르지 않게)
const SIZE_KEY = 'pff-label-size'
function loadSize(): LabelSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return v && v in SIZES ? (v as LabelSize) : '40x30'
  } catch {
    return '40x30'
  }
}

// 미리보기는 몇 장까지만
const PREVIEW = 11

// QR 라벨 인쇄 (v2 TBD-18, docs/screens.md 1.10): 재고 관리 › 필라멘트 › QR.
// 라벨은 이미 등록된 스풀로만 (번호 예약 · 새 라벨 없음). 인쇄하면 그 스풀은 `라벨 뽑음` → `라벨 없음` 에서 빠짐
export default function LabelsPage({ pick, onBack }: { pick: LabelPick | null; onBack: () => void }) {
  const spools = useAllSpools()
  const filaments = useFilaments()
  const info = useLabelInfo()
  const failed = [spools, filaments, info].find((r) => r.isError)
  // 스풀은 이 화면을 연 뒤 새로 받아 온 것으로 — 방금 만든 스풀이 아직 없는 예전 목록으로 고르지 않게 (처음 고르기는 한 번만)
  const fresh = spools.isFetchedAfterMount

  return (
    <>
      <div className="sub-head">
        <button type="button" className="crumb-btn" onClick={onBack}>
          ‹ 필라멘트
        </button>
        <h2>QR 스풀 관리</h2>
      </div>
      {failed ? (
        <div className="empty">
          불러오지 못했어요: {failed.error.message}{' '}
          <button className="btn small" onClick={() => [spools, filaments, info].forEach((r) => r.refetch())}>
            다시 시도
          </button>
        </div>
      ) : spools.data && fresh && filaments.data && info.data ? (
        <Labels
          rows={toRows(spools.data, filaments.data)}
          spools={spools.data}
          base={baseUrl(info.data.public_url, window.location.origin)}
          pick={pick}
        />
      ) : (
        <div className="empty">불러오는 중…</div>
      )}
    </>
  )
}

function Labels({ rows, spools, base, pick }: { rows: Row[]; spools: Spool[]; base: string; pick: LabelPick | null }) {
  const toast = useToast()
  const refresh = useRefreshFilaments()
  const [only, setOnly] = useState<'nolabel' | 'all'>('nolabel')
  const [q, setQ] = useState('')
  const [size, setSize] = useState(loadSize)
  // 처음 한 번: 지출 저장 · 재고 추가 알림의 `라벨 인쇄` 로 왔으면 그 스풀을 골라 둔다
  const [picked, setPicked] = useState(() => initialPick(spools, pick))
  const [from, setFrom] = useState(pick?.from ?? '')
  const allRef = useRef<HTMLInputElement>(null)

  const noLabel = rows.filter((r) => needsLabel(r.spool))
  const list = search(only === 'nolabel' ? noLabel : rows, q)
  // 고른 것 (번호 순서). 지워진 스풀은 저절로 빠짐
  const chosen = rows.filter((r) => picked.has(r.spool.id)).sort((a, b) => a.spool.code_no - b.spool.code_no)
  // 맨 위 전체 선택: 보이는 것(검색 결과)이 다 골라졌으면 체크, 일부면 반쯤
  const onCount = list.filter((r) => picked.has(r.spool.id)).length
  const allOn = list.length > 0 && onCount === list.length
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = onCount > 0 && !allOn
  })

  const toggle = (ids: number[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const clear = () => {
    setPicked(new Set())
    setFrom('')
  }
  const chooseSize = (v: LabelSize) => {
    setSize(v)
    try {
      localStorage.setItem(SIZE_KEY, v)
    } catch {
      /* 저장 불가 */
    }
  }

  // 인쇄: 아래 인쇄용 라벨(화면에는 안 보임)을 브라우저 인쇄 창으로. 창을 닫으면 `라벨 뽑음` 으로 표시하고,
  // 인쇄를 취소했으면 알림의 `되돌리기` 로 되돌린다 (인쇄했는지는 브라우저가 알려 주지 않음)
  const print = async () => {
    const done = chosen.map((r) => r.spool)
    window.print()
    const ids = done.map((s) => s.id)
    try {
      await markLabels(ids)
      await refresh()
      clear()
      toast(`${done.length}장 인쇄했어요 (${codesText(done)})`, async () => {
        await markLabels(ids, false)
        await refresh()
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const sample = qrUrl(base, chosen[0]?.spool.code ?? rows[0]?.spool.code ?? 'S00001')
  const local = localOnly(base)

  return (
    <section className="panel qr-panel">
      <div className="panel-head">
        <h3>라벨 인쇄</h3>
        <div className="seg-btns" role="tablist">
          <button type="button" className={only === 'nolabel' ? 'on' : ''} onClick={() => setOnly('nolabel')}>
            라벨 없음 {noLabel.length}
          </button>
          <button type="button" className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>
            전체 · 다시 인쇄
          </button>
        </div>
      </div>
      <div className="panel-body">
        {from && chosen.length > 0 && (
          <div className="url-line">
            {from} · <b>{chosen.length}개</b> 골라 뒀어요
          </div>
        )}
        <div className="qr-tools">
          <input
            type="search"
            placeholder="코드 · 색상 · 필라멘트 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select aria-label="라벨 크기" value={size} onChange={(e) => chooseSize(e.target.value as LabelSize)}>
            {Object.entries(SIZES).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="pick-list">
          {list.length ? (
            <>
              <label className="pick-row head">
                <input
                  ref={allRef}
                  type="checkbox"
                  aria-label="보이는 것 모두 고르기"
                  checked={allOn}
                  onChange={(e) =>
                    toggle(
                      list.map((r) => r.spool.id),
                      e.target.checked,
                    )
                  }
                />
                <span>코드</span>
                <span />
                <span>색상</span>
                <span>상태</span>
              </label>
              {list.map((r) => (
                <label key={r.spool.id} className="pick-row">
                  <input
                    type="checkbox"
                    checked={picked.has(r.spool.id)}
                    onChange={(e) => toggle([r.spool.id], e.target.checked)}
                  />
                  <b className="code">{r.spool.code}</b>
                  <Swatch hex={r.color.hex} />
                  <span className="nm">
                    {r.color.name}{' '}
                    <span className="hint">
                      {r.filament.display_name}
                      {r.spool.buy != null && ` · 주문 ${dotDate(r.spool.purchased_at)}`}
                    </span>
                  </span>
                  <span className="tags">
                    {!r.spool.label_printed && <span className="badge warn">라벨 없음</span>}
                    <span className={`status-tag s-${r.spool.status}`}>{STATUS_LABEL[r.spool.status]}</span>
                  </span>
                </label>
              ))}
            </>
          ) : (
            <p className="hint pick-none">
              {q ? '찾는 스풀이 없어요' : only === 'nolabel' ? '라벨을 안 뽑은 스풀이 없어요' : '등록된 스풀이 없어요'}
            </p>
          )}
        </div>
        {chosen.length > 0 && (
          <div className="labels">
            {chosen.slice(0, PREVIEW).map((r) => (
              <LabelCard key={r.spool.id} row={r} base={base} />
            ))}
            {chosen.length > PREVIEW && <div className="more">외 {chosen.length - PREVIEW}장</div>}
          </div>
        )}
        <div className={local ? 'url-line warn' : 'url-line'}>
          QR 안의 주소 <b>{sample}</b>
          <Help tip="폰 기본 카메라로 찍으면 이 주소가 열려요. 앞부분은 backend/.env 의 PUBLIC_URL. 폰과 PC 가 같은 와이파이여야 하고, PC 주소가 바뀌면 붙인 라벨이 안 열려요 — 공유기에서 PC 주소를 고정(DHCP 예약)해 두세요" />
          {local && <span className="warn-text">폰에서 안 열림 · backend/.env 에 PUBLIC_URL</span>}
        </div>
      </div>
      <div className="panel-foot">
        <span className="hint">{chosen.length ? `${chosen.length}장 고름` : '뽑을 스풀을 고르세요'}</span>
        {chosen.length > 0 && (
          <button type="button" className="btn small" onClick={clear}>
            모두 풀기
          </button>
        )}
        <div className="spacer" />
        <button type="button" className="btn primary" disabled={!chosen.length} onClick={print}>
          {chosen.length}장 인쇄
        </button>
      </div>
      {chosen.length > 0 && <PrintSheet rows={chosen} base={base} size={size} />}
    </section>
  )
}

// 라벨 한 장: QR + 코드 + 색상 · 필라멘트 (같은 색 스풀은 아무 라벨이나 붙여도 됨)
function LabelCard({ row, base }: { row: Row; base: string }) {
  return (
    <div className="lbl">
      <QrCode text={qrUrl(base, row.spool.code)} />
      <div className="lbl-text">
        <div className="lbl-code">{row.spool.code}</div>
        <div className="lbl-name">
          {row.color.name} · {row.filament.material_name} {row.filament.series}
        </div>
        <div className="lbl-brand">{row.filament.brand_name}</div>
      </div>
    </div>
  )
}

// 인쇄용 라벨 (화면에는 안 보이고 인쇄할 때만). body 바로 아래에 그려서 인쇄할 때 나머지를 숨긴다 (qr.css)
// 라벨 프린터: 한 장 = 한 페이지 / A4: 24칸씩 한 페이지
function PrintSheet({ rows, base, size }: { rows: Row[]; base: string; size: LabelSize }) {
  const page = size === 'a4' ? 'A4' : size === '40x30' ? '40mm 30mm' : '50mm 30mm'
  return createPortal(
    <div className={`print-sheet size-${size}`}>
      <style>{`@page { size: ${page}; margin: 0; }`}</style>
      {size === 'a4'
        ? chunk(rows, A4_PER_PAGE).map((group, i) => (
            <div key={i} className="print-page">
              {group.map((r) => (
                <LabelCard key={r.spool.id} row={r} base={base} />
              ))}
            </div>
          ))
        : rows.map((r) => <LabelCard key={r.spool.id} row={r} base={base} />)}
    </div>,
    document.body,
  )
}
