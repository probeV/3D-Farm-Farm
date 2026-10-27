import { useState } from 'react'
import { createProduct, deleteProduct, updateProduct, useRefreshProducts } from '../../../api/products'
import Dialog from '../../../components/Dialog'
import { useConfirm } from '../../../components/useConfirm'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import CategoryDialog from '../catalog/CategoryDialog'
import { calcCost } from '../cost'
import { STATUS_LABEL, STATUSES } from '../status'
import { useCostData, type CostData } from '../useCostData'
import CostPanel from './CostPanel'
import { initialValues, previewOf, type Start } from './draft'
import MaterialLines from './MaterialLines'
import { productSchema } from './schemas'

const NEW_CATEGORY = 'new'

// 머리 띠의 칸은 칸 아래에 글씨 자리가 없어서 머리 띠 맨 아래에 "칸 이름: 오류" 로 모아 보여 준다
const HERO_FIELDS = { no: 'No.', name: '제품명', category: '카테고리', subcategory: '세부 분류', status: '상태' }

// 제품 추가 · 복제 · 수정 (PRD-04 · PRD-04a · PRD-05~09, docs/screens.md 2.5)
// 창 제목은 따로 없고 머리 띠의 제품명이 제목. 원가는 입력하는 동안 바로 다시 계산한다
export default function ProductDialog(props: Start & { onClose: () => void }) {
  const data = useCostData().data
  // 목록 화면이 다 불러온 뒤에만 열리므로 data 는 항상 있다
  return data && <ProductForm {...props} data={data} />
}

function ProductForm({ product, copyOf, preset, onClose, data }: Start & { onClose: () => void; data: CostData }) {
  const { catalog, categories, filaments, parts, rows } = data
  const refresh = useRefreshProducts()
  const toast = useToast()

  const confirm = useConfirm()
  const products = rows.map((r) => r.product)
  const form = useForm(productSchema, initialValues({ product, copyOf, preset }, products, filaments))
  const { values, errors, busy, change, update, submit } = form
  const [addingCategory, setAddingCategory] = useState(false)

  const preview = previewOf(values)
  const cost = calcCost(preview, catalog)
  const subcategories = categories.find((c) => String(c.id) === values.category)?.subcategories ?? []

  const save = () =>
    submit(async ({ no, filaments: lines, ...rest }) => {
      const body = {
        ...rest,
        no: no ?? undefined, // 비우면 서버가 다음 번호 (수정이면 그대로)
        // 사용량이 0 인 줄은 빼고 저장 (줄이 하나뿐이면 남김)
        filaments: lines.filter((r) => r.grams || lines.length === 1),
      }
      if (product) await updateProduct(product.id, body)
      else await createProduct(body)
      await refresh()
      toast('저장했어요')
      onClose()
    })

  const remove = async () => {
    if (
      !product ||
      !(await confirm({ title: '제품 삭제', message: `${product.name} 제품을 삭제할까요?`, danger: true }))
    )
      return
    try {
      await deleteProduct(product.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  const header = (
    <div className="hero">
      <div className="hero-top">
        <label className="code-wrap">
          No.
          <input
            className="ghost"
            inputMode="numeric"
            value={values.no}
            onChange={(e) => change('no', e.target.value)}
          />
        </label>
        {!product &&
          (copyOf ? (
            <span className="copy-from">{copyOf.name}에서 복제</span>
          ) : (
            <span className="badge info">새 제품</span>
          ))}
        <div className="spacer" />
        {/* 상태: 고정 3가지라 드롭다운 대신 알약 버튼 */}
        <div className="pills">
          {STATUSES.map((s) => (
            <label key={s} className={`pill-${s}`}>
              <input
                type="radio"
                name="status"
                value={s}
                checked={values.status === s}
                onChange={() => change('status', s)}
              />
              <span>{STATUS_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </div>
      <input
        className="title-input"
        value={values.name}
        placeholder="제품명"
        data-autofocus
        onChange={(e) => change('name', e.target.value)}
      />
      <div className="hero-meta">
        <select
          className="ghost"
          value={values.category}
          onChange={(e) => {
            // 목록 끝 `+ 새 카테고리…` 를 고르면 카테고리 추가 창을 열고, 선택은 그대로 둔다
            if (e.target.value === NEW_CATEGORY) return setAddingCategory(true)
            update({ category: e.target.value, subcategory: '' })
          }}
        >
          <option value="">미분류</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>+ 새 카테고리…</option>
        </select>
        <span>›</span>
        <select
          className="ghost"
          value={values.subcategory}
          disabled={!subcategories.length}
          onChange={(e) => change('subcategory', e.target.value)}
        >
          <option value="">세부 분류 없음</option>
          {subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {Object.entries(HERO_FIELDS).map(
        ([k, label]) =>
          errors[k] && (
            <div key={k} className="err">
              {/* 서버 문구가 이미 칸 이름으로 시작하면 (No. 3 는 이미 있습니다.) 그대로 */}
              {errors[k].startsWith(label) ? errors[k] : `${label}: ${errors[k]}`}
            </div>
          ),
      )}
    </div>
  )

  return (
    <>
      <Dialog
        size="xwide"
        header={header}
        onClose={onClose}
        submitLabel="저장"
        onSubmit={save}
        busy={busy}
        footerLeft={
          product && (
            <button type="button" className="btn danger" onClick={remove}>
              삭제
            </button>
          )
        }
      >
        <div className="product-form">
          <div>
            <MaterialLines
              values={values}
              errors={errors}
              catalog={catalog}
              filaments={filaments}
              parts={parts}
              filamentTotal={cost.filament}
              partTotal={cost.parts}
              onFilaments={(r) => change('filaments', r)}
              onParts={(r) => change('parts', r)}
            />
            <label className="field full" style={{ marginTop: 18 }}>
              <span>메모</span>
              <textarea rows={2} value={values.note} onChange={(e) => change('note', e.target.value)} />
            </label>
          </div>
          <CostPanel
            values={values}
            errors={errors}
            change={change}
            cost={cost}
            preview={preview}
            setting={catalog.setting}
          />
        </div>
      </Dialog>
      {/* 대화상자 안에 넣지 않고 옆에 그린다 (form 안에 form 이 들어가지 않도록) */}
      {addingCategory && (
        <CategoryDialog
          category={null}
          onClose={() => setAddingCategory(false)}
          onSaved={(c) => update({ category: String(c.id), subcategory: '' })}
        />
      )}
    </>
  )
}
