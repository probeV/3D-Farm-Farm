import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  updateCategory,
  updateSubcategory,
  useRefreshProducts,
  type Category,
} from '../../../api/products'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import { categorySchema } from './schemas'

interface Props {
  category: Category | null // null 이면 추가
  onClose: () => void
  onSaved?: (category: Category) => void // 저장한 카테고리 (제품 창의 `+ 새 카테고리…` 에서 그 카테고리를 고르게)
}

let lastKey = 0

// 카테고리 추가 / 수정 (PRD-11, docs/screens.md 2.4): 이름 + 세부 분류 목록. 세부 분류는 필요할 때만
// 저장하면 이름을 바꾸고, 세부 분류는 뺀 것 삭제 · 바꾼 것 수정 · 새 것 추가 순서로 서버에 보낸다
export default function CategoryDialog({ category, onClose, onSaved }: Props) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const original = category?.subcategories ?? []
  const { values, errors, busy, change, submit } = useForm(categorySchema, {
    name: category?.name ?? '',
    subs: original.map((s) => ({ key: ++lastKey, id: s.id as number | null, name: s.name })),
  })
  const productCount = (id: number | null) => original.find((s) => s.id === id)?.product_count ?? 0

  const setSub = (i: number, name: string) =>
    change(
      'subs',
      values.subs.map((s, j) => (j === i ? { ...s, name } : s)),
    )

  const removeSub = (i: number) => {
    // 제품이 있는 세부 분류는 서버도 막는다 (409)
    if (productCount(values.subs[i].id)) return toast('제품이 있는 세부 분류는 뺄 수 없어요')
    change(
      'subs',
      values.subs.filter((_, j) => j !== i),
    )
  }

  const save = () =>
    submit(async ({ name, subs }) => {
      const saved = category ? await updateCategory(category.id, { name }) : await createCategory({ name })
      // 카테고리는 저장됐으므로, 세부 분류에서 실패해도 목록은 다시 불러온다
      try {
        for (const s of original) if (!subs.some((x) => x.id === s.id)) await deleteSubcategory(s.id)
        for (const s of subs) {
          const before = original.find((x) => x.id === s.id)
          if (before && before.name !== s.name) await updateSubcategory(before.id, { name: s.name })
          if (s.id == null) await createSubcategory({ category: saved.id, name: s.name })
        }
      } catch (e) {
        // 세부 분류의 400 `{"name": [...]}` 이 카테고리 이름 칸에 붙지 않게 알림으로
        throw new Error(e instanceof Error ? e.message : String(e))
      } finally {
        await refresh()
      }
      toast('저장했어요')
      onSaved?.(saved)
      onClose()
    })

  const remove = async () => {
    if (!category || !confirm(`${category.name} 카테고리를 삭제할까요?`)) return
    try {
      await deleteCategory(category.id) // 제품이 있으면 409
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      size="narrow"
      title={category ? '카테고리 수정' : '카테고리 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        category && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
    >
      <div className="form-grid">
        <Field label="카테고리 이름 *" error={errors.name} full>
          <input
            value={values.name}
            placeholder="예: 수업 교구"
            data-autofocus
            onChange={(e) => change('name', e.target.value)}
          />
        </Field>
        <div className="field full">
          <span>세부 분류</span>
          {values.subs.length ? (
            values.subs.map((s, i) => (
              <div key={s.key}>
                <div className="sub-row">
                  <input value={s.name} placeholder="예: 수학" onChange={(e) => setSub(i, e.target.value)} />
                  <span className="hint">{s.id == null ? '새로 추가' : `제품 ${productCount(s.id)}개`}</span>
                  <button type="button" className="icon-btn" title="빼기" onClick={() => removeSub(i)}>
                    ✕
                  </button>
                </div>
                {errors[`subs.${i}.name`] && <span className="err">{errors[`subs.${i}.name`]}</span>}
              </div>
            ))
          ) : (
            <p className="hint" style={{ margin: '4px 0' }}>
              세부 분류 없이 써도 돼요. 필요할 때만 추가하세요.
            </p>
          )}
          <button
            type="button"
            className="btn small"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => change('subs', [...values.subs, { key: ++lastKey, id: null, name: '' }])}
          >
            + 세부 분류 추가
          </button>
        </div>
      </div>
    </Dialog>
  )
}
