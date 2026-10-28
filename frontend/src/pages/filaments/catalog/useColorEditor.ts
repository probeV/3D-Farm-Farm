import {
  createColor,
  deleteColor,
  updateColor,
  useRefreshFilaments,
  type Color,
  type Filament,
} from '../../../api/filaments'
import { useProducts, useRefreshProducts } from '../../../api/products'
import { useConfirm, type ConfirmEffect } from '../../../components/useConfirm'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import { colorSchema, hex } from './schemas'

// 색상 입력 · 저장 · 삭제 (PRD FIL-04 · FIL-05 · FIL-06 · FIL-09). 색상 추가 창과 색상 · 스풀 관리 창(색상 정보 탭)이 같이 쓴다
export function useColorEditor(filament: Filament, color: Color | null, onDone: () => void) {
  const refresh = useRefreshFilaments()
  const refreshProducts = useRefreshProducts()
  const products = useProducts().data ?? [] // 이 색상을 쓰는 제품 (삭제 확인 · 요약)
  const toast = useToast()
  const confirm = useConfirm()
  const form = useForm(colorSchema, {
    name: color?.name ?? '',
    hex: color?.hex ?? '#CCCCCC',
    price: color?.price != null ? String(color.price) : '',
  })

  // 색상 코드는 입력하는 동안 바로 미리보기 · 안내 (형식이 틀리면 빨간 안내)
  const parsedHex = hex.safeParse(form.values.hex)
  const hexOk = parsedHex.success ? parsedHex.data : null
  const hexError = form.errors.hex ?? (hexOk ? undefined : parsedHex.error?.issues[0].message)
  const using = color ? products.filter((p) => p.filaments.some((r) => r.color === color.id)).map((p) => p.name) : []

  const save = () =>
    form.submit(async (data) => {
      if (color) await updateColor(color.id, data)
      else await createColor({ filament: filament.id, ...data })
      await refresh()
      toast('저장했어요')
      onDone()
    })

  // 스풀은 함께 삭제, 제품 줄은 '색상 선택 안 함' 으로 (PRD FIL-09). 함께 바뀌는 것이 있으면 2차 확인, 되돌리기는 없음
  const remove = async () => {
    if (!color) return
    const n = color.counts
    const spools = n.sealed + n.open + n.empty
    const effects: ConfirmEffect[] = []
    if (spools)
      effects.push({
        title: `스풀 ${spools}개도 함께 삭제`,
        details: [`재고 ${n.sealed} · 사용 중 ${n.open} · 사용 완료 ${n.empty}`, '삭제한 스풀은 되돌릴 수 없어요.'],
      })
    if (using.length)
      effects.push({
        title: `제품 ${using.length}개의 색상이 비워짐`,
        details: [
          using.join(' · '),
          `'색상 선택 안 함'으로 바뀌고 필라멘트 가격으로 계산돼요.${color.price != null ? ' 색상 가격이 따로 있어서 원가가 바뀌어요.' : ''}`,
        ],
        tone: 'warn',
      })
    const ok = await confirm({
      title: '색상 삭제',
      message: `${filament.display_name} · ${color.name} 색상을 삭제할까요?`,
      effects,
      danger: true,
      twice: effects.length > 0,
    })
    if (!ok) return
    try {
      await deleteColor(color.id)
      await Promise.all([refresh(), using.length && refreshProducts()])
      toast(spools ? `${color.name} 색상과 스풀 ${spools}개를 삭제했어요` : `${color.name} 색상을 삭제했어요`)
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return { ...form, hexOk, hexError, shown: hexOk ?? color?.hex ?? '#CCCCCC', using, save, remove }
}

export type ColorEditor = ReturnType<typeof useColorEditor>
