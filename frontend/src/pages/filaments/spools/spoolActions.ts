// 스풀 동작 + 되돌리기 (PRD 3.4 · 3.5). 서버는 이력을 저장하지 않으므로, 방금 받은 결과를 기억해 두었다가
// 알림의 `되돌리기` 에서 반대 요청을 보낸다 (docs/api.md "되돌리기")
import {
  addSpools,
  createSpool,
  deleteSpool,
  deleteSpools,
  updateSpool,
  useRefreshFilaments,
  type Color,
  type PurchaseInput,
  type Spool,
  type SpoolStatus,
} from '../../../api/filaments'
import { useToast } from '../../../components/useToast'
import { STATUS_LABEL } from '../stock'

// 만든 스풀 코드 (번호 순서로 옴): 이어진 번호면 "S00041 ~ S00043", 아니면 "S00011, S00051, S00052" (5개 넘으면 "외 N개")
export function codesText(spools: Spool[]) {
  const first = spools[0]
  const last = spools[spools.length - 1]
  if (spools.length === 1) return first.code
  if (last.code_no - first.code_no === spools.length - 1) return `${first.code} ~ ${last.code}`
  const shown = spools
    .slice(0, 5)
    .map((s) => s.code)
    .join(', ')
  return spools.length > 5 ? `${shown} 외 ${spools.length - 5}개` : shown
}

export function useSpoolActions() {
  const toast = useToast()
  // 스풀이 바뀌면 필라멘트 화면(개수 · kg)과 열려 있는 스풀 창을 함께 다시 불러온다
  const refresh = useRefreshFilaments()
  const withUndo = (message: string, undo: () => Promise<unknown>) =>
    toast(message, async () => {
      await undo()
      await refresh()
    })

  return {
    // 실패 알림 (입력칸 오류가 아닌 것)
    fail: (e: unknown) => toast(e instanceof Error ? e.message : String(e)),

    // 재고 추가 → 되돌리기: 만든 스풀을 지움
    async purchase(color: Color, input: PurchaseInput) {
      const made = await addSpools(color.id, input)
      await refresh()
      withUndo(`${made.length}개 추가했어요 (${codesText(made)})`, () => deleteSpools(made.map((s) => s.id)))
    },

    // 상태 변경 (날짜는 서버 규칙) → 되돌리기: 이전 상태 · 날짜를 그대로
    async changeStatus(color: Color, spool: Spool, to: SpoolStatus) {
      const before = { status: spool.status, opened_at: spool.opened_at, finished_at: spool.finished_at }
      await updateSpool(spool.id, { status: to })
      await refresh()
      withUndo(`${color.name} ${spool.code} → ${STATUS_LABEL[to]}`, () => updateSpool(spool.id, before))
    },

    // 삭제 → 되돌리기: 같은 번호 · 내용으로 다시 만듦
    async remove(spool: Spool) {
      await deleteSpool(spool.id)
      await refresh()
      const { code_no, color, status, price, purchased_at, opened_at, finished_at, note } = spool
      const content = { code_no, color, status, price, purchased_at, opened_at, finished_at, note }
      withUndo(`${spool.code} 삭제했어요`, () => createSpool(content))
    },

    // 구매가 수정 (되돌리기 없음 — 다시 고치면 됨)
    async setPrice(spool: Spool, price: number | null) {
      await updateSpool(spool.id, { price })
      await refresh()
      toast(`${spool.code} 구매가를 저장했어요`)
    },
  }
}
