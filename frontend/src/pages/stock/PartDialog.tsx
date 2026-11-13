import { useEffect, useState } from 'react'
import {
  createPart,
  deletePart,
  updatePart,
  useHistory,
  useRefreshProducts,
  type HistoryKind,
  type Part,
  type PartCategory,
  type PartKind,
} from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import Help from '../../components/Help'
import { dotDate, unitWon, won } from '../../format'
import { useForm } from '../../useForm'
import StatusBadge from '../products/StatusBadge'
import AdjustDialog from './AdjustDialog'
import { KIND_LABEL, qty } from './kinds'
import PartCategoryDialog from './PartCategoryDialog'
import type { Usage } from './partList'
import { partSchema, previewUnitPrice } from './schemas'

const UNITS = ['개', '장', '롤', '세트', 'm', 'g']
const NEW_CATEGORY = 'new'

interface Props {
  kind: PartKind // 탭 (추가할 때 이 탭으로)
  part: Part | null // null 이면 추가
  copyOf?: Part // 복제할 부자재 (값만 복사, 사용하는 제품은 복사하지 않음)
  shop?: string // 관리 창에서 고른 구매처 (추가할 때 미리 채움)
  category?: number // 관리 창에서 고른 카테고리 (추가할 때 미리 고름)
  categories: PartCategory[]
  parts: Part[] // `+ 새 카테고리…` 창에 넘김
  usages: Usage[] // 이 부속품을 쓰는 제품 (추가 · 복제면 빈 목록, 부속품 탭만)
  onClose: () => void
}

// 품목 사진: 고른 파일(file) 또는 지금 사진 주소(url). removed = 저장할 때 지움
interface Photo {
  file: File | null
  url: string | null
  removed: boolean
}

// 품목 추가 · 복제 · 수정 (PART-02 · PART-02a · STOCK-03 · 04 · 05, docs/screens.md 3.5)
// 품목 이름이 겹치면 서버가 400 (name 칸), 제품 · 포장 세트에서 쓰면 삭제 시 409.
// 사진은 나머지를 저장한 뒤 따로 올린다 (multipart). 남은 수량은 추가할 때만 입력, 그 뒤로는 `조정`
export default function PartDialog({ kind, part, copyOf, shop, category, categories, parts, usages, onClose }: Props) {
  const L = KIND_LABEL[kind]
  const refresh = useRefreshProducts()
  const toast = useToast()

  const confirm = useConfirm()
  const src = part ?? copyOf
  const { values, errors, busy, change, submit } = useForm(partSchema, {
    name: part ? part.name : copyOf ? `${copyOf.name} (복사)` : '',
    category: String(src ? (src.category ?? '') : (category ?? '')),
    shop: src?.shop ?? shop ?? '',
    buy_url: src?.buy_url ?? '',
    price: src?.price != null ? String(src.price) : '',
    pack_qty: String(src?.pack_qty ?? 1),
    unit: src?.unit ?? '개',
    alert: String(src?.alert ?? 0),
    stock: '0',
    note: src?.note ?? '',
  })
  const [addingCategory, setAddingCategory] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  // 복제할 때 사진은 복사하지 않는다 (같은 파일을 두 품목이 쓰면 한쪽에서 지울 때 같이 지워짐)
  const [photo, setPhoto] = useState<Photo>({ file: null, url: part?.photo ?? null, removed: false })
  // 고른 파일 미리보기 주소 (창을 닫거나 다른 파일을 고르면 해제)
  const [preview_, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!photo.file) return setPreview(null)
    const url = URL.createObjectURL(photo.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo.file])
  const shown = photo.removed ? null : (preview_ ?? photo.url)
  const inUse = kind === 'part' ? usages.length : kind === 'pack' ? (part?.set_count ?? 0) : 0

  const unit = values.unit.trim() || '개'
  const preview = previewUnitPrice(values.price, values.pack_qty)
  const before = part?.unit_price ?? null
  const after = preview?.unitPrice ?? null
  // 서버 단가는 소수 2자리라 비교도 소수 2자리로
  const changed = part != null && (before == null ? after != null : after == null || Math.abs(before - after) >= 0.005)

  const save = () =>
    submit(async ({ stock, ...data }) => {
      const saved = part ? await updatePart(part.id, data) : await createPart({ ...data, kind, stock })
      if (photo.file) {
        const body = new FormData()
        body.append('photo', photo.file)
        await updatePart(saved.id, body)
      } else if (photo.removed && part?.photo) await updatePart(saved.id, { photo: null })
      await refresh()
      toast(changed && usages.length ? `저장했어요 · 제품 ${usages.length}개 원가에 바로 반영돼요` : '저장했어요')
      onClose()
    })

  const remove = async () => {
    if (!part || !(await confirm({ title: `${L} 삭제`, message: `${part.name} 을(를) 삭제할까요?`, danger: true })))
      return
    try {
      await deletePart(part.id) // 제품 · 포장 세트에서 쓰면 409
      await refresh()
      toast(`${part.name} 삭제했어요`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const title = part ? (
    `${L} 수정`
  ) : (
    <>
      {L} 추가{' '}
      {copyOf ? <span className="copy-from">{copyOf.name}에서 복제</span> : <span className="badge info">새 {L}</span>}
    </>
  )
  const blockedBy = kind === 'pack' ? `포장 세트 ${inUse}개` : `제품 ${inUse}개`

  return (
    <>
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
                disabled={inUse > 0}
                title={inUse ? `${blockedBy}에서 쓰고 있어서 삭제할 수 없어요` : undefined}
              >
                삭제
              </button>
              {inUse > 0 && <span className="foot-note">{blockedBy}에서 쓰는 중</span>}
            </>
          )
        }
      >
        <div className="form-grid">
          <div className="field full">
            <span>사진</span>
            <div className="photo-field">
              <div className="photo-box">{shown ? <img src={shown} alt="" /> : '사진 없음'}</div>
              <div className="photo-btns">
                <label className="btn small">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setPhoto({ file, url: photo.url, removed: false })
                      e.target.value = '' // 같은 파일을 다시 골라도 바뀌게
                    }}
                  />
                  {shown ? '사진 바꾸기' : '사진 넣기'}
                </label>
                {shown && (
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => setPhoto({ file: null, url: photo.url, removed: true })}
                  >
                    사진 빼기
                  </button>
                )}
                <span className="hint">카드에 크게 보여요 · png · jpg · webp</span>
              </div>
            </div>
          </div>
          <Field label="품목 *" error={errors.name} full>
            <input
              value={values.name}
              placeholder="예: 네오디뮴 자석 6×3mm"
              data-autofocus
              onChange={(e) => change('name', e.target.value)}
            />
          </Field>
          <Field label="카테고리" error={errors.category}>
            <select
              value={values.category}
              // 목록 끝 `+ 새 카테고리…` 를 고르면 카테고리 추가 창을 열고, 선택은 그대로 둔다
              onChange={(e) =>
                e.target.value === NEW_CATEGORY ? setAddingCategory(true) : change('category', e.target.value)
              }
            >
              <option value="">미분류</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ 새 카테고리…</option>
            </select>
          </Field>
          <Field label="회사/구매처" error={errors.shop}>
            <input value={values.shop} placeholder="예: 쿠팡" onChange={(e) => change('shop', e.target.value)} />
          </Field>
          <Field label="구매 링크" error={errors.buy_url} full>
            <input
              type="url"
              value={values.buy_url}
              placeholder="https://… (목록의 구매 버튼으로 바로 열려요)"
              onChange={(e) => change('buy_url', e.target.value)}
            />
          </Field>
          <Field
            label="구매가 (묶음 전체)"
            error={errors.price}
            hint={
              part?.last_buy
                ? `최근 구매가 · ${dotDate(part.last_buy.date)} ${part.last_buy.name} (지출)`
                : `지출에 이 ${L}${kind === 'pack' ? '를' : '을'} 넣으면 최근 구매가로 자동`
            }
          >
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
          {part ? (
            <div className="field">
              <span>남은 수량</span>
              <div className="stock-now">
                <b>
                  {qty(part.stock)}
                  {part.unit}
                </b>
                <button type="button" className="btn small" onClick={() => setAdjusting(true)}>
                  조정
                </button>
              </div>
              <span className="hint">
                {kind === 'supply' ? '구매(지출) · 다 씀으로' : '구매(지출) · 판매로'} 바뀌어요
              </span>
            </div>
          ) : (
            <Field label="남은 수량" error={errors.stock} hint="지금 가진 수량">
              <div className="with-suffix">
                <input inputMode="decimal" value={values.stock} onChange={(e) => change('stock', e.target.value)} />
                <em>{unit}</em>
              </div>
            </Field>
          )}
          <label className="field">
            <span>
              부족 알림 기준
              <Help tip="남은 수량이 이 값 이하면 `부족` · 0 이하면 `없음`" />
            </span>
            <div className="with-suffix">
              <input inputMode="decimal" value={values.alert} onChange={(e) => change('alert', e.target.value)} />
              <em>이하</em>
            </div>
            {errors.alert && <span className="err">{errors.alert}</span>}
          </label>
          <Field label="비고" error={errors.note} full>
            <textarea
              rows={2}
              value={values.note}
              placeholder="규격 등"
              onChange={(e) => change('note', e.target.value)}
            />
          </Field>
          {part && kind === 'part' && (
            <UsageList usages={usages} unit={unit} before={before} after={after} changed={changed} />
          )}
          {part && <HistoryList part={part} />}
        </div>
      </Dialog>
      {adjusting && part && <AdjustDialog part={part} onClose={() => setAdjusting(false)} />}
      {/* 대화상자 안에 넣지 않고 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {addingCategory && (
        <PartCategoryDialog
          kind={kind}
          category={null}
          parts={parts}
          onClose={() => setAddingCategory(false)}
          onSaved={(c) => change('category', String(c.id))}
        />
      )}
    </>
  )
}

interface UsageProps {
  usages: Usage[]
  unit: string
  before: number | null // 저장된 개당 단가
  after: number | null // 입력 중인 개당 단가
  changed: boolean
}

// 사용하는 제품: 제품마다 수량과 제품 1개당 이 부속품 금액. 단가를 바꾸는 중이면 `720원 → 900원` (오르면 빨강, 내리면 초록)
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
          아직 이 부속품을 쓰는 제품이 없어요.
        </p>
      )}
    </div>
  )
}

const HISTORY_KIND: Record<HistoryKind, string> = { buy: '지출', sale: '판매', use: '다 씀', adjust: '조정' }

// 입출고 기록 (STOCK-05): 최근순. 날짜 · 종류 · ± 수량 · 그 뒤 남은 수량 · 설명
function HistoryList({ part }: { part: Part }) {
  const { data } = useHistory(part.id)
  return (
    <div className="field full">
      <div className="used-head">
        <span>입출고 기록</span>
        {data && data.length > 0 && <small className="muted">최근순</small>}
      </div>
      {!data ? (
        <p className="hint">불러오는 중…</p>
      ) : data.length ? (
        <div className="moves">
          {data.map((h) => (
            <div key={h.id} className="move">
              <span className="d">{dotDate(h.date)}</span>
              <span className={`badge ${h.kind === 'adjust' ? '' : h.qty > 0 ? 'good' : 'info'}`}>
                {HISTORY_KIND[h.kind]}
              </span>
              <span className="t" title={h.note}>
                {h.note}
              </span>
              <span className={h.qty > 0 ? 'q plus' : 'q minus'}>
                {h.qty > 0 ? '+' : ''}
                {qty(h.qty)}
              </span>
              <span className="a">
                → {qty(h.after)}
                {part.unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: '4px 0' }}>
          기록 없음
        </p>
      )}
    </div>
  )
}
