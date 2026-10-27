import { useCallback, useState } from 'react'
import Help from '../../components/Help'
import { unitWon, won } from '../../format'
import ManageDialog from './ManageDialog'
import PartDialog from './PartDialog'
import SortTh from '../../components/SortTh'
import { nextSort } from '../../sort'
import { filterParts, NO_FILTER, SORT_COLUMNS, summarize, type ListFilter, type Sort } from './partList'
import { usePartsData } from './usePartsData'

type DialogState = { kind: 'manage' } | { kind: 'part'; partId: number }

// 부자재 화면: 사용 여부 개수 → 요약 카드 → 부자재 목록 (docs/screens.md 3장)
export default function PartsPage() {
  const { error, retry, data } = usePartsData()
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  if (error) {
    return (
      <div className="empty">
        불러오지 못했어요: {error.message}{' '}
        <button className="btn small" onClick={retry}>
          다시 시도
        </button>
      </div>
    )
  }
  if (!data) return <div className="empty">불러오는 중…</div>

  const { parts, products, usagesOf } = data
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const sum = summarize(parts, products)
  // 가격 미입력이 모두 채워졌으면 필터도 풀림
  const noPriceOnly = filter.noPriceOnly && sum.noPrice > 0
  const list = filterParts(parts, { ...filter, noPriceOnly })
  const filtered = filter.q !== '' || noPriceOnly
  const th = {
    sort: filter.sort,
    onSort: (key: Sort['key']) => set({ sort: nextSort(SORT_COLUMNS, filter.sort, key) }),
  }

  return (
    <>
      <div className="top-row">
        <div className="stats">
          <span>
            제품에서 사용<b>{sum.used}</b>
          </span>
          <span>
            안 쓰는 부자재<b>{sum.unused}</b>
          </span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog({ kind: 'manage' })}>
          부자재 관리
        </button>
      </div>

      <div className="sum-cards">
        <div className="sum-card">
          <span>등록 부자재</span>
          <strong>
            {sum.total}
            <small>개</small>
          </strong>
        </div>
        <div className="sum-card">
          <span>
            제품당 평균 부자재비
            <Help tip={`판매중이고 부자재를 쓰는 제품 ${sum.avgBase}개 기준 · 가격 미입력은 0원`} />
          </span>
          <strong>{won(sum.avgPartsCost)}</strong>
        </div>
        <button
          className={['sum-card', sum.noPrice ? 'warn' : '', noPriceOnly ? 'active' : ''].join(' ')}
          onClick={() => sum.noPrice && set({ noPriceOnly: !noPriceOnly })}
        >
          <span>
            가격 미입력
            <Help
              tip={
                noPriceOnly
                  ? '가격 미입력 부자재만 보는 중 · 다시 누르면 해제'
                  : '가격이 없으면 제품 원가에 0원으로 계산돼요 · 누르면 그 부자재만 보기'
              }
            />
          </span>
          <strong>
            {sum.noPrice}
            <small>개</small>
          </strong>
        </button>
      </div>

      <div className="section-head list-toolbar">
        <h3>부자재 목록</h3>
        <span className="hint">{list.length}개</span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="품목 · 구매처 · 비고 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        {filtered && (
          <button className="btn small" onClick={() => set({ q: '', noPriceOnly: false })}>
            필터 지우기
          </button>
        )}
      </div>

      {list.length ? (
        <div className="table-wrap">
          <table className="parts-table">
            <thead>
              <tr>
                <SortTh sortKey="name" {...th}>
                  품목
                </SortTh>
                <SortTh sortKey="shop" {...th}>
                  회사/구매처
                </SortTh>
                <SortTh sortKey="price" num {...th}>
                  구매가
                </SortTh>
                <SortTh sortKey="packQty" num {...th}>
                  묶음 수량
                </SortTh>
                <SortTh sortKey="unitPrice" num {...th}>
                  개당 단가
                </SortTh>
                <SortTh sortKey="used" num {...th}>
                  사용 제품
                </SortTh>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const usages = usagesOf(p.id)
                return (
                  <tr key={p.id} onClick={() => setDialog({ kind: 'part', partId: p.id })}>
                    <td className="pname">{p.name}</td>
                    <td>{p.shop || <span className="muted">-</span>}</td>
                    <td className="num">
                      {p.price == null ? <span className="badge warn">미입력</span> : won(p.price)}
                    </td>
                    <td className="num">
                      {p.pack_qty.toLocaleString('ko-KR')}
                      {p.unit}
                    </td>
                    <td className="num unit-price">
                      {p.unit_price == null ? <span className="muted">-</span> : unitWon(p.unit_price)}
                    </td>
                    {usages.length ? (
                      <td
                        className="num used"
                        title={usages.map((u) => `${u.name} · ${u.qty.toLocaleString('ko-KR')}${p.unit}`).join('\n')}
                      >
                        {usages.length}개
                      </td>
                    ) : (
                      <td className="num muted">-</td>
                    )}
                    <td className="note" title={p.note}>
                      {p.note}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {parts.length ? '조건에 맞는 부자재가 없어요.' : '등록된 부자재가 없어요. 부자재 관리에서 추가하세요.'}
        </div>
      )}

      {dialog?.kind === 'manage' && <ManageDialog onClose={closeDialog} />}
      {dialog?.kind === 'part' && renderPart(dialog.partId)}
    </>
  )

  // 부자재가 지워졌으면(다른 창에서) 그리지 않는다
  function renderPart(id: number) {
    const part = parts.find((p) => p.id === id)
    return part && <PartDialog part={part} usages={usagesOf(part.id)} onClose={closeDialog} />
  }
}
