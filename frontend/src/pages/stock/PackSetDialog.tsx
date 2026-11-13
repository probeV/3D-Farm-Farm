import { useState } from 'react'
import {
  createPackSet,
  deletePackSet,
  updatePackSet,
  useRefreshProducts,
  type PackSet,
  type Part,
  type Product,
} from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import Help from '../../components/Help'
import { fieldErrorsOf } from '../../api/client'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { unitWon, won } from '../../format'

interface Line {
  part: number
  qty: string // 입력칸 글자 그대로
}

interface Props {
  set: PackSet | null // null 이면 추가
  packs: Part[] // 포장재 (포장 탭의 품목)
  products: Product[] // 기본 포장으로 쓰는 제품 이름
  onClose: () => void
}

// 포장 세트 추가 · 수정 (STOCK-06, docs/screens.md 3.8): 이름 · 들어가는 포장재 줄 · 세트 원가 · 비고.
// 같은 포장재 줄은 저장할 때 합친다 (서버). 기본 포장으로 쓰는 제품이 있으면 삭제 불가
export default function PackSetDialog({ set, packs, products, onClose }: Props) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const confirm = useConfirm()
  const sorted = [...packs].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const [name, setName] = useState(set?.name ?? '')
  const [note, setNote] = useState(set?.note ?? '')
  const [lines, setLines] = useState<Line[]>(
    set
      ? set.lines.map((l) => ({ part: l.part, qty: String(l.qty) }))
      : sorted[0]
        ? [{ part: sorted[0].id, qty: '1' }]
        : [],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const byId = new Map(packs.map((p) => [p.id, p]))
  const using = set ? products.filter((p) => p.default_pack === set.id) : []
  const amount = (l: Line) => (byId.get(l.part)?.unit_price ?? 0) * (Number(l.qty) || 0)
  const total = lines.reduce((a, l) => a + amount(l), 0)
  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  const save = async () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = '입력하세요'
    if (!lines.length) errs.lines = '포장재를 한 개 이상 넣으세요'
    lines.forEach((l, i) => {
      const n = Number(l.qty)
      if (!(n > 0) || !/^\d+(\.\d{1,2})?$/.test(l.qty.trim())) errs[`lines.${i}.qty`] = '0 보다 큰 수 (소수 2자리)'
    })
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const body = {
        name: name.trim(),
        note: note.trim(),
        lines: lines.map((l) => ({ part: l.part, qty: Number(l.qty) })),
      }
      if (set) await updatePackSet(set.id, body)
      else await createPackSet(body)
      await refresh()
      toast(set && set.product_count ? `저장했어요 · 제품 ${set.product_count}개 원가에 바로 반영돼요` : '저장했어요')
      onClose()
    } catch (e) {
      const found = fieldErrorsOf(e, ['name', 'lines'])
      setErrors(found)
      if (!Object.keys(found).length) toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!set || !(await confirm({ title: '포장 세트 삭제', message: `${set.name} 을(를) 삭제할까요?`, danger: true })))
      return
    try {
      await deletePackSet(set.id) // 기본 포장으로 쓰는 제품이 있으면 409
      await refresh()
      toast(`${set.name} 삭제했어요`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      size="wide"
      title={set ? '포장 세트 수정' : '포장 세트 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        set && (
          <>
            <button
              type="button"
              className="btn danger"
              onClick={remove}
              disabled={using.length > 0}
              title={using.length ? `제품 ${using.length}개의 기본 포장이라 삭제할 수 없어요` : undefined}
            >
              삭제
            </button>
            {using.length > 0 && <span className="foot-note">제품 {using.length}개의 기본 포장</span>}
          </>
        )
      }
    >
      <div className="form-grid">
        <Field label="세트 이름 *" error={errors.name} full>
          <input value={name} placeholder="예: 봉투 포장" data-autofocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field full">
          <span>들어가는 포장재</span>
          <div className="line line-head">
            <span>포장재</span>
            <span>수량</span>
            <span className="amt">금액</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const p = byId.get(l.part)
            return (
              <div key={i}>
                <div className="line">
                  <select value={l.part} onChange={(e) => patch(i, { part: Number(e.target.value) })}>
                    {sorted.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.unit_price == null ? '가격 미입력' : `${unitWon(x.unit_price)}/${x.unit}`}
                      </option>
                    ))}
                  </select>
                  <div className="with-suffix">
                    <input inputMode="decimal" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} />
                    <em>{p?.unit}</em>
                  </div>
                  <span className="amt">{won(amount(l))}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    title="줄 빼기"
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
                {errors[`lines.${i}.qty`] && <span className="err">{errors[`lines.${i}.qty`]}</span>}
              </div>
            )
          })}
          {errors.lines && <span className="err">{errors.lines}</span>}
          <div>
            <button
              type="button"
              className="btn small add"
              disabled={!sorted.length}
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  { part: (sorted.find((x) => !ls.some((l) => l.part === x.id)) ?? sorted[0]).id, qty: '1' },
                ])
              }
            >
              + 포장재
            </button>
            {!sorted.length && <span className="hint"> 포장재를 먼저 등록하세요</span>}
          </div>
          <div className="total-box">
            <span className="muted">세트 원가 (1번 쌀 때)</span>
            <b>{won(total)}</b>
          </div>
        </div>
        <Field label="비고" full>
          <textarea
            rows={2}
            value={note}
            placeholder="예: 키링 · 작은 소품"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {set && (
          <div className="field full">
            <span>
              기본 포장으로 쓰는 제품 {using.length}개
              <Help tip="제품 원가 화면의 제품 창에서 골라요. 세트를 고치면 그 제품 원가가 바로 바뀌어요" />
            </span>
            {using.length ? (
              <div className="chips">
                {using.map((p) => (
                  <span key={p.id} className="chip">
                    {p.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="hint">없음</span>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
