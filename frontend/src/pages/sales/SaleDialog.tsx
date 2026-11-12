import { useState } from 'react'
import type { CostSetting } from '../../api/products'
import { createSale, deleteSale, updateSale, useRefreshSales, type Sale, type SaleChannel } from '../../api/sales'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import Help from '../../components/Help'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { dotDate, pct, today, won } from '../../format'
import { useForm } from '../../useForm'
import type { ProductRow } from '../products/list/productList'
import { STATUS_LABEL, STATUSES } from '../products/status'
import { CHANNELS } from './channels'
import { autoFee, snapshotCost } from './saleList'
import { saleSchema } from './schemas'

interface Props {
  sale: Sale | null // null 이면 추가
  copyOf?: Sale // 복제할 판매 (날짜는 오늘, 주문번호는 비움, 원가는 지금 원가 계산표로 다시)
  rows: ProductRow[] // 제품 + 원가 계산표 (제품 원가 화면과 같은 계산)
  setting: CostSetting
  onCopy: (sale: Sale) => void
  onClose: () => void
}

// 제품 줄 (입력칸 값 그대로). unit_cost 는 입력칸이 아니라 제품을 고를 때 복사해 둔 값
interface Line {
  key: number
  product: string // 제품 id, '' = 고르지 않음 (또는 제품을 지운 줄)
  product_name: string // 팔 때 이름. 새 줄은 비워 두면 서버가 제품 이름을 복사
  qty: string
  unit_price: string
  unit_cost: number | null
}

let lineKey = 0
const newLine = (): Line => ({
  key: ++lineKey,
  product: '',
  product_name: '',
  qty: '1',
  unit_price: '',
  unit_cost: null,
})
// 입력칸 글자 → 숫자 (계산 미리보기용, 틀린 값은 0)
const n = (v: string) => Number(v.replace(/,/g, '')) || 0

// 판매 추가 · 복제 · 수정 (SALE-02 · 03 · 04 · 05, docs/screens.md 판매)
export default function SaleDialog({ sale, copyOf, rows, setting, onCopy, onClose }: Props) {
  const refresh = useRefreshSales()
  const toast = useToast()
  const confirm = useConfirm()
  const src = sale ?? copyOf
  const rowOf = (id: string) => rows.find((r) => String(r.product.id) === id)

  const { values, errors, busy, change, update, submit } = useForm(saleSchema, {
    date: sale?.date ?? today(),
    channel: (src?.channel ?? 'store') as SaleChannel,
    order_no: sale?.order_no ?? '',
    items: src
      ? src.items.map((i): Line => {
          const r = i.product == null ? undefined : rowOf(String(i.product))
          return {
            key: ++lineKey,
            product: i.product == null ? '' : String(i.product),
            // 수정: 팔 때 이름 · 원가 그대로 / 복제: 새 판매라 지금 이름 · 원가 (지운 제품은 이름만)
            product_name: sale || !r ? i.product_name : '',
            qty: String(i.qty),
            unit_price: String(i.unit_price),
            unit_cost: sale ? i.unit_cost : r ? snapshotCost(r.cost) : i.unit_cost,
          }
        })
      : [newLine()],
    shipping_received: src ? String(src.shipping_received) : '0',
    fee: sale ? String(sale.fee) : '',
    shipping_cost: String(src?.shipping_cost ?? setting.shipping_cost),
    note: src?.note ?? '',
  })
  const lines = values.items as Line[]

  // 미리보기 계산 (저장 전)
  const picked = lines.filter((l) => l.product || l.product_name)
  const gross = picked.reduce((a, l) => a + n(l.qty) * n(l.unit_price), 0)
  const shipping = n(values.shipping_received)
  const auto = autoFee(values.channel, gross, shipping, setting)
  // 수수료를 직접 고쳤는지: 수정이면 저장된 값이 지금 자동 계산과 다를 때
  const [feeManual, setFeeManual] = useState(
    () => sale != null && sale.fee !== autoFee(sale.channel, sale.gross, sale.shipping_received, setting),
  )
  const fee = feeManual ? n(values.fee) : auto
  const settle = gross + shipping - fee
  const noCost = picked.some((l) => l.unit_cost == null)
  const cost = picked.reduce((a, l) => a + n(l.qty) * (l.unit_cost ?? 0), 0)
  const profit = settle - cost - n(values.shipping_cost)

  const setLine = (i: number, patch: Partial<Line>) =>
    change(
      'items',
      lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    )
  // 제품을 고르면 단가 = 제품 판매가, 원가 = 지금 원가 계산표 값 (원가 없으면 null)
  const pickProduct = (i: number, id: string) => {
    const r = rowOf(id)
    setLine(i, {
      product: id,
      product_name: '',
      unit_price: r?.product.sale_price != null ? String(r.product.sale_price) : '',
      unit_cost: r ? snapshotCost(r.cost) : null,
    })
  }

  const save = () =>
    submit(async (data) => {
      const body = { ...data, fee: feeManual ? data.fee : auto }
      if (sale) await updateSale(sale.id, body)
      else await createSale(body)
      await refresh()
      toast('저장했어요')
      onClose()
    })

  const remove = async () => {
    if (
      !sale ||
      !(await confirm({
        title: '판매 삭제',
        message: `${dotDate(sale.date)} · ${sale.items[0]?.product_name ?? ''}${sale.items.length > 1 ? ` 외 ${sale.items.length - 1}` : ''} (${won(sale.gross)}) 판매를 삭제할까요?`,
        danger: true,
      }))
    )
      return
    try {
      await deleteSale(sale.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const title = sale ? (
    '판매 수정'
  ) : (
    <>판매 추가 {copyOf && <span className="copy-from">{dotDate(copyOf.date)} 판매에서 복제</span>}</>
  )
  const feeTip = `스마트스토어: (판매가 합계 + 배송비) × ${setting.fee_order}% (네이버페이 주문관리) + ${setting.fee_sales}% (판매). 제품 원가 설정의 수수료 값. 정산 내역과 다르면 직접 고치세요`

  return (
    <Dialog
      title={title}
      size="wide"
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        sale && (
          <>
            <button type="button" className="btn danger" onClick={remove}>
              삭제
            </button>
            <button type="button" className="btn" onClick={() => onCopy(sale)}>
              복제
            </button>
          </>
        )
      }
    >
      <div className="form-grid">
        <Field label="날짜 *" error={errors.date}>
          <input type="date" value={values.date} max={today()} onChange={(e) => change('date', e.target.value)} />
        </Field>
        <Field label="주문번호" error={errors.order_no}>
          <input
            value={values.order_no}
            placeholder="스마트스토어 주문번호 (선택)"
            onChange={(e) => change('order_no', e.target.value)}
          />
        </Field>
        {/* 라디오 버튼 묶음이라 label 이 아닌 div */}
        <div className="field full">
          <span>판매처 *</span>
          <div className="cat-pick" role="radiogroup" aria-label="판매처">
            {CHANNELS.map((c) => (
              <label key={c.key}>
                <input
                  type="radio"
                  name="channel"
                  checked={values.channel === c.key}
                  onChange={() => {
                    change('channel', c.key)
                    setFeeManual(false) // 판매처를 바꾸면 수수료는 다시 자동
                  }}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="sale-items">
        <div className="sale-items-head">
          <span>제품 *</span>
          <span className="num">수량</span>
          <span className="num">단가</span>
          <span className="num">
            원가 (개당)
            <Help tip="저장할 때 원가 계산표의 개당 원가를 복사해 둬요. 나중에 필라멘트 · 부자재 가격이 바뀌어도 이 판매는 그대로예요. 주문별 이익 참고용" />
          </span>
          <span className="num">소계</span>
          <span />
        </div>
        {lines.map((l, i) => {
          const r = l.product ? rowOf(l.product) : undefined
          const salePrice = r?.product.sale_price
          const diff = salePrice != null && l.unit_price !== '' && n(l.unit_price) !== salePrice
          const deleted = !l.product && !!l.product_name
          const err = (k: string) => errors[`items.${i}.${k}`]
          return (
            <div className="sale-item" key={l.key}>
              <select
                aria-label="제품"
                value={l.product}
                data-autofocus={!sale && i === 0 ? true : undefined}
                onChange={(e) => pickProduct(i, e.target.value)}
              >
                <option value="">{deleted ? `${l.product_name} (삭제된 제품)` : '제품 고르기'}</option>
                {STATUSES.map((st) => {
                  const list = rows.filter((x) => x.product.status === st)
                  return (
                    list.length > 0 && (
                      <optgroup key={st} label={STATUS_LABEL[st]}>
                        {list.map((x) => (
                          <option key={x.product.id} value={x.product.id}>
                            {String(x.product.no).padStart(3, '0')} {x.product.name}
                            {x.product.sale_price != null && ` · ${won(x.product.sale_price)}`}
                          </option>
                        ))}
                      </optgroup>
                    )
                  )
                })}
              </select>
              <div className="with-suffix">
                <input
                  inputMode="numeric"
                  aria-label="수량"
                  value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                />
                <em>개</em>
              </div>
              <div className="with-suffix">
                <input
                  inputMode="numeric"
                  aria-label="단가"
                  value={l.unit_price}
                  onChange={(e) => setLine(i, { unit_price: e.target.value })}
                />
                <em>원</em>
              </div>
              <span
                className={l.unit_cost == null && (l.product || deleted) ? 'cost-val missing' : 'cost-val'}
                title={
                  l.unit_cost == null && l.product
                    ? '원가 계산표에 입력이 덜 돼 원가가 없어요 — 제품 원가 화면에서 채우세요'
                    : undefined
                }
              >
                {!l.product && !deleted ? '-' : l.unit_cost == null ? '원가 없음' : won(l.unit_cost)}
              </span>
              <span className="sub">{l.product || deleted ? won(n(l.qty) * n(l.unit_price)) : '-'}</span>
              <button
                type="button"
                className="icon-btn"
                title="이 줄 빼기"
                aria-label="이 줄 빼기"
                disabled={lines.length <= 1}
                onClick={() =>
                  change(
                    'items',
                    lines.filter((_, j) => j !== i),
                  )
                }
              >
                ✕
              </button>
              {(err('product') || err('qty') || err('unit_price')) && (
                <span className="line-err">{err('product') ?? err('qty') ?? err('unit_price')}</span>
              )}
              {diff && <span className="changed">제품 판매가 {won(salePrice)}와 달라요</span>}
            </div>
          )
        })}
        <div className="sale-items-foot">
          <button type="button" className="btn small add" onClick={() => change('items', [...lines, newLine()])}>
            + 제품 추가
          </button>
          {errors.items && <span className="err">{errors.items}</span>}
          <div className="spacer" />
          <span className="hint">{picked.reduce((a, l) => a + n(l.qty), 0)}개</span>
        </div>
      </div>

      <div className="sale-calc">
        <span>판매가 합계</span>
        <span className="v">{won(gross)}</span>
        <span>
          + 받은 배송비<small>손님이 낸 배송비</small>
        </span>
        <span className="with-suffix">
          <input
            inputMode="numeric"
            aria-label="받은 배송비"
            value={values.shipping_received}
            onChange={(e) => change('shipping_received', e.target.value)}
          />
          <em>원</em>
        </span>
        <span>
          − 수수료
          <Help tip={feeTip} />
          <small>
            {feeManual ? (
              <>
                직접 입력 ·{' '}
                <button type="button" className="fee-reset" onClick={() => setFeeManual(false)}>
                  {values.channel === 'store' ? `다시 계산 (${won(auto)})` : '0원으로'}
                </button>
              </>
            ) : values.channel === 'store' ? (
              `자동 계산 · ${(Math.round((setting.fee_order + setting.fee_sales) * 100) / 100).toLocaleString('ko-KR')}%`
            ) : (
              '직접 판매 · 기타는 0원 (있으면 입력)'
            )}
          </small>
        </span>
        <span className="with-suffix">
          <input
            inputMode="numeric"
            aria-label="수수료"
            value={feeManual ? values.fee : String(auto)}
            onChange={(e) => {
              update({ fee: e.target.value })
              setFeeManual(e.target.value !== String(auto))
            }}
          />
          <em>원</em>
        </span>
        <span className="total">= 정산 금액</span>
        <span className="v total">{won(settle)}</span>
        {errors.fee && <span className="calc-err">{errors.fee}</span>}
        {errors.shipping_received && <span className="calc-err">{errors.shipping_received}</span>}
      </div>

      <div className="sale-calc profit-box">
        <span>정산 금액</span>
        <span className="v">{won(settle)}</span>
        <span>
          − 원가 합계
          <small>{noCost ? '원가 없는 제품이 있어요 — 제품 원가 화면에서 채우세요' : '줄마다 개당 원가 × 수량'}</small>
        </span>
        <span className="v">{noCost ? '-' : won(cost)}</span>
        <span>
          − 낸 택배비<small>판매자가 택배사에 낸 돈. 기본값은 제품 원가 설정의 배송비</small>
        </span>
        <span className="with-suffix">
          <input
            inputMode="numeric"
            aria-label="낸 택배비"
            value={values.shipping_cost}
            onChange={(e) => change('shipping_cost', e.target.value)}
          />
          <em>원</em>
        </span>
        <span className="total">
          = 이익
          <Help tip="이 주문이 대략 얼마 남았는지 보는 참고값. 구독 · 광고 같은 운영비와 실패 출력은 빠져 있어서, 실제 월 이익은 손익 화면에서 따로 봐요" />
        </span>
        <span className="v total">
          {noCost ? '-' : won(profit)}
          {!noCost && <span className="rate">{pct(gross ? profit / gross : null)}</span>}
        </span>
        {errors.shipping_cost && <span className="calc-err">{errors.shipping_cost}</span>}
      </div>

      <Field label="메모" error={errors.note} full>
        <textarea
          rows={2}
          value={values.note}
          placeholder="예: 이름 각인 · 현금 · 플리마켓"
          onChange={(e) => change('note', e.target.value)}
        />
      </Field>
    </Dialog>
  )
}
