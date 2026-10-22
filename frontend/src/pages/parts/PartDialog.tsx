import { createPart, deletePart, updatePart, useRefreshProducts, type Part } from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useToast } from '../../components/useToast'
import { unitWon, won } from '../../format'
import { useForm } from '../../useForm'
import StatusBadge from '../products/StatusBadge'
import type { Usage } from './partList'
import { partSchema, previewUnitPrice } from './schemas'

const UNITS = ['개', '장', '롤', '세트', 'm', 'g']

interface Props {
  part: Part | null // null 이면 추가
  copyOf?: Part // 복제할 부자재 (값만 복사, 사용하는 제품은 복사하지 않음)
  shop?: string // 관리 창에서 고른 구매처 (추가할 때 미리 채움)
  usages: Usage[] // 이 부자재를 쓰는 제품 (추가 · 복제면 빈 목록)
  onClose: () => void
}

// 부자재 추가 · 복제 · 수정 (PART-02 · PART-02a, docs/screens.md 3.5)
// 품목 이름이 겹치면 서버가 400 (name 칸), 제품에서 쓰면 삭제 시 409
export default function PartDialog({ part, copyOf, shop, usages, onClose }: Props) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const src = part ?? copyOf
  const { values, errors, busy, change, submit } = useForm(partSchema, {
    name: part ? part.name : copyOf ? `${copyOf.name} (복사)` : '',
    shop: src?.shop ?? shop ?? '',
    price: src?.price != null ? String(src.price) : '',
    pack_qty: String(src?.pack_qty ?? 1),
    unit: src?.unit ?? '개',
    note: src?.note ?? '',
  })

  const unit = values.unit.trim() || '개'
  const preview = previewUnitPrice(values.price, values.pack_qty)
  const before = part?.unit_price ?? null
  const after = preview?.unitPrice ?? null
  // 서버 단가는 소수 2자리라 비교도 소수 2자리로
  const changed = part != null && (before == null ? after != null : after == null || Math.abs(before - after) >= 0.005)

  const save = () =>
    submit(async (data) => {
      if (part) await updatePart(part.id, data)
      else await createPart(data)
      await refresh()
      toast(changed && usages.length ? `저장했어요 · 제품 ${usages.length}개 원가에 바로 반영돼요` : '저장했어요')
      onClose()
    })

  const remove = async () => {
    if (!part || !confirm(`${part.name} 을(를) 삭제할까요?`)) return
    try {
      await deletePart(part.id) // 제품에서 쓰면 409
      await refresh()
      toast(`${part.name} 삭제했어요`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const title = part ? (
    '부자재 수정'
  ) : (
    <>
      부자재 추가{' '}
      {copyOf ? (
        <span className="copy-from">{copyOf.name}에서 복제</span>
      ) : (
        <span className="badge info">새 부자재</span>
      )}
    </>
  )

  return (
    <Dialog
      title={title}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        part && (
          <>
            <button
              type="button"
              className="btn danger"
              onClick={remove}
              disabled={usages.length > 0}
              title={usages.length ? `제품 ${usages.length}개에서 쓰고 있어서 삭제할 수 없어요` : undefined}
            >
              삭제
            </button>
            {usages.length > 0 && <span className="foot-note">제품에서 쓰는 중이라 삭제 불가</span>}
          </>
        )
      }
    >
      <div className="form-grid">
        <Field label="품목 *" error={errors.name} full>
          <input
            value={values.name}
            placeholder="예: 네오디뮴 자석 6×3mm"
            data-autofocus
            onChange={(e) => change('name', e.target.value)}
          />
        </Field>
        <Field label="회사/구매처" error={errors.shop} full>
          <input value={values.shop} placeholder="예: 쿠팡" onChange={(e) => change('shop', e.target.value)} />
        </Field>
        <Field label="구매가 (묶음 전체)" error={errors.price}>
          <div className="with-suffix">
            <input
              inputMode="numeric"
              value={values.price}
              placeholder="미입력"
              onChange={(e) => change('price', e.target.value)}
            />
            <em>원</em>
          </div>
        </Field>
        <Field label="묶음 수량 · 단위" error={errors.pack_qty ?? errors.unit}>
          <div className="qty-unit">
            <input
              inputMode="decimal"
              aria-label="묶음 수량"
              value={values.pack_qty}
              onChange={(e) => change('pack_qty', e.target.value)}
            />
            <input
              list="part-units"
              aria-label="단위"
              value={values.unit}
              onChange={(e) => change('unit', e.target.value)}
            />
            <datalist id="part-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </Field>
        <div className="field full">
          <div className="unit-preview">
            {preview == null ? (
              <>
                <span className="muted">구매가를 넣으면 개당 단가를 계산해요</span>
                {values.price.trim() === '' && <span className="badge warn">가격 미입력 · 원가에 0원</span>}
              </>
            ) : (
              <>
                <span className="muted">
                  {won(preview.price)} ÷ {preview.packQty.toLocaleString('ko-KR')}
                  {unit}
                </span>
                <span>
                  {changed && before != null && <span className="was">{unitWon(before)}</span>}
                  {unit}당 <b>{unitWon(preview.unitPrice)}</b>
                </span>
              </>
            )}
          </div>
        </div>
        <Field label="비고" error={errors.note} full>
          <textarea
            rows={2}
            value={values.note}
            placeholder="규격 · 구매 링크 등"
            onChange={(e) => change('note', e.target.value)}
          />
        </Field>
        {part && <UsageList usages={usages} unit={unit} before={before} after={after} changed={changed} />}
      </div>
    </Dialog>
  )
}

interface UsageProps {
  usages: Usage[]
  unit: string
  before: number | null // 저장된 개당 단가
  after: number | null // 입력 중인 개당 단가
  changed: boolean
}

// 사용하는 제품: 제품마다 수량과 제품 1개당 이 부자재 금액. 단가를 바꾸는 중이면 `720원 → 900원` (오르면 빨강, 내리면 초록)
function UsageList({ usages, unit, before, after, changed }: UsageProps) {
  return (
    <div className="field full">
      <div className="used-head">
        <span>사용하는 제품 {usages.length}개</span>
        {usages.length > 0 && <small className="muted">제품 1개당 금액</small>}
      </div>
      {usages.length ? (
        usages.map((u) => {
          const a = (before ?? 0) * u.qty
          const b = (after ?? 0) * u.qty
          const diff = Math.round(b) - Math.round(a)
          return (
            <div key={u.productId} className="used-row">
              <span>
                {u.name}
                <StatusBadge status={u.status} />
              </span>
              <span className="qty">
                {u.qty.toLocaleString('ko-KR')}
                {unit}
              </span>
              <span className="amt">
                {changed ? (
                  <>
                    <span className="was">{won(a)} → </span>
                    <span className={diff > 0 ? 'up' : diff < 0 ? 'down' : ''}>{won(b)}</span>
                  </>
                ) : (
                  <span className={before == null ? 'muted' : ''}>{won(a)}</span>
                )}
              </span>
            </div>
          )
        })
      ) : (
        <p className="hint" style={{ margin: '4px 0' }}>
          아직 이 부자재를 쓰는 제품이 없어요.
        </p>
      )}
    </div>
  )
}
