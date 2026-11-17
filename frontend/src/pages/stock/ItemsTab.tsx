import { useCallback, useState } from 'react'
import { useExpenses } from '../../api/expenses'
import { spendPart, useRefreshProducts, type PackSet, type Part, type PartKind } from '../../api/products'
import { useSales } from '../../api/sales'
import Help from '../../components/Help'
import SettingsButton from '../../components/SettingsButton'
import SortTh from '../../components/SortTh'
import { useToast } from '../../components/useToast'
import { dotDate, today, unitWon, won } from '../../format'
import { nextSort } from '../../sort'
import BuyLink from './BuyLink'
import { KIND_LABEL, levelOf, qty } from './kinds'
import ManageDialog from './ManageDialog'
import PackSetDialog from './PackSetDialog'
import PartDialog from './PartDialog'
import {
  canPack,
  filterParts,
  NO_FILTER,
  setCost,
  setsByPart,
  SORT_COLUMNS,
  summarize,
  type ListFilter,
  type Sort,
} from './partList'
import ReplaceDialog from './ReplaceDialog'
import { usePartsData } from './usePartsData'

type DialogState =
  | { kind: 'manage' }
  | { kind: 'replace' }
  | { kind: 'part'; partId: number | null; category?: number }
  | { kind: 'set'; set: PackSet | null }
type View = 'card' | 'table'

// 보기(카드 | 표)는 탭마다 브라우저에 기억
const viewKey = (kind: PartKind) => `pff-stock-view-${kind}`
function loadView(kind: PartKind): View {
  try {
    return localStorage.getItem(viewKey(kind)) === 'table' ? 'table' : 'card'
  } catch {
    return 'card'
  }
}

// 재고 관리의 부속품 · 포장 · 소모품 탭 (STOCK-01 ~ 08, docs/screens.md 3장)
// 맨 위 개수 · 버튼 → 요약 카드 → (포장: 포장 세트) → 품목 목록 (카테고리별 카드 / 표)
export default function ItemsTab({ kind, onSettings }: { kind: PartKind; onSettings: () => void }) {
  const { error, retry, data } = usePartsData(kind)
  const sales = useSales().data
  const expenses = useExpenses().data
  const refresh = useRefreshProducts()
  const toast = useToast()
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [view, setView] = useState<View>(() => loadView(kind))
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])
  const L = KIND_LABEL[kind]

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

  const { parts, allParts, categories, products, packSets, usagesOf, alert } = data
  const byId = new Map(allParts.map((p) => [p.id, p]))
  const setsOf = setsByPart(packSets)
  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name
  const set = (patch: Partial<ListFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const sum = summarize(parts, alert)
  // 가격 미입력 · 부족이 모두 풀렸으면 필터도 풀림
  const noPriceOnly = filter.noPriceOnly && sum.noPrice > 0
  const lowOnly = filter.lowOnly && sum.low.length > 0
  // 고른 카테고리가 지워졌으면 전체로
  const category =
    filter.category === '' || filter.category === 'none' || categoryName(Number(filter.category.slice(2)))
      ? filter.category
      : ''
  const list = filterParts(parts, { ...filter, noPriceOnly, lowOnly, category }, alert)
  const filtered = filter.q !== '' || noPriceOnly || lowOnly || category !== ''
  const th = {
    sort: filter.sort,
    onSort: (key: Sort['key']) => set({ sort: nextSort(SORT_COLUMNS, filter.sort, key) }),
  }
  const changeView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(viewKey(kind), v)
    } catch {
      /* 저장 불가 */
    }
  }
  const month = today().slice(0, 7)

  // 소모품 `1개 다 씀` (STOCK-07)
  const spendOne = async (p: Part) => {
    try {
      const saved = await spendPart(p.id)
      await refresh()
      toast(`${p.name} 1${p.unit} 다 씀 · ${qty(saved.stock)}${p.unit} 남음`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  // 품목 줄 아래 설명: 부속품은 쓰는 제품 수, 포장재는 쓰는 세트 수, 소모품은 마지막으로 다 쓴 날
  const usedText = (p: Part) =>
    kind === 'part'
      ? `제품 ${p.product_count}개`
      : kind === 'pack'
        ? `세트 ${p.set_count}개`
        : p.last_used
          ? `다 씀 ${dotDate(p.last_used)}`
          : '다 쓴 기록 없음'
  const usedTip = (p: Part) =>
    kind === 'part'
      ? usagesOf(p.id)
          .map((u) => `${u.name} ${qty(u.qty)}${p.unit}`)
          .join('\n')
      : kind === 'pack'
        ? (setsOf.get(p.id) ?? []).map((s) => s.name).join('\n')
        : ''

  const lowCard = (
    <button
      className={['sum-card', sum.low.length ? 'warn' : '', lowOnly ? 'active' : ''].join(' ')}
      onClick={() => sum.low.length && set({ lowOnly: !lowOnly })}
    >
      <span>
        부족 · 없음
        <Help
          tip={lowOnly ? `부족한 ${L}만 보는 중 · 다시 누르면 해제` : `남은 수량이 알림 기준 이하 · 누르면 그 ${L}만`}
        />
      </span>
      <strong>
        {sum.low.length}
        <small>개</small>
      </strong>
      {sum.low.length > 0 && <span className="sub">{sum.low.map((p) => p.name).join(' · ')}</span>}
    </button>
  )
  const noPriceCard = (
    <button
      className={['sum-card', sum.noPrice ? 'warn' : '', noPriceOnly ? 'active' : ''].join(' ')}
      onClick={() => sum.noPrice && set({ noPriceOnly: !noPriceOnly })}
    >
      <span>
        가격 미입력
        <Help
          tip={
            noPriceOnly
              ? `가격 미입력 ${L}만 보는 중 · 다시 누르면 해제`
              : `가격이 없으면 제품 원가에 0원으로 계산돼요 · 누르면 그 ${L}만 보기`
          }
        />
      </span>
      <strong>
        {sum.noPrice}
        <small>개</small>
      </strong>
    </button>
  )

  return (
    <>
      <div className="top-row">
        <div className="stats">
          {kind === 'part' && (
            <>
              <span>
                제품에서 사용<b>{sum.used}</b>
              </span>
              <span>
                안 쓰는 부속품<b>{sum.unused}</b>
              </span>
            </>
          )}
          {kind === 'pack' && (
            <>
              <span>
                포장재<b>{parts.length}</b>
              </span>
              <span>
                포장 세트<b>{packSets.length}</b>
              </span>
              <span>
                기본 포장 없는 제품<b>{products.filter((p) => p.default_pack == null).length}</b>
              </span>
            </>
          )}
          {kind === 'supply' && (
            <>
              <span>
                소모품<b>{parts.length}</b>
              </span>
              <span>
                카테고리<b>{categories.length}</b>
              </span>
            </>
          )}
        </div>
        <div className="spacer" />
        {kind === 'part' && (
          <button
            className="btn"
            title="제품에서 쓰는 부속품을 다른 부속품으로 한 번에 바꿔요"
            onClick={() => setDialog({ kind: 'replace' })}
          >
            제품의 부속품 바꾸기
          </button>
        )}
        <button className="btn" onClick={() => setDialog({ kind: 'manage' })}>
          {L} 관리
        </button>
        <SettingsButton label="재고 관리" onClick={onSettings} />
      </div>

      {kind === 'part' && (
        <div className="sum-cards">
          <div className="sum-card">
            <span>등록 부속품</span>
            <strong>
              {sum.total}
              <small>개</small>
            </strong>
          </div>
          {lowCard}
          {noPriceCard}
        </div>
      )}
      {kind === 'pack' && (
        <div className="sum-cards four">
          <div className="sum-card">
            <span>
              남은 포장재 금액
              <Help tip="남은 수량 × 개당 단가 합계" />
            </span>
            <strong>{won(sum.value)}</strong>
          </div>
          {lowCard}
          <div className="sum-card">
            <span>
              이번 달 판매로 쓴 포장
              <Help tip="이번 달 판매 중 포장 줄이 있는 주문 수" />
            </span>
            <strong>
              {sales ? sales.filter((s) => s.date.startsWith(month) && s.packs.length).length : '-'}
              <small>건</small>
            </strong>
          </div>
          <div className="sum-card">
            <span>
              바로 쌀 수 있는 세트
              <Help tip="지금 남은 수량으로 세트별 몇 번 쌀 수 있나 · 가장 모자란 포장재 기준" />
            </span>
            <div className="packs">
              {packSets.length ? (
                packSets.map((s) => {
                  const n = canPack(s, byId)
                  return (
                    <span key={s.id} className={n ? '' : 'zero'}>
                      {s.name} <b>{n}</b>
                    </span>
                  )
                })
              ) : (
                <span className="muted">세트 없음</span>
              )}
            </div>
          </div>
        </div>
      )}
      {kind === 'supply' && (
        <div className="sum-cards">
          <div className="sum-card">
            <span>등록 소모품</span>
            <strong>
              {sum.total}
              <small>개</small>
            </strong>
          </div>
          {lowCard}
          <div className="sum-card">
            <span>
              이번 달 소모품 지출
              <Help tip="지출 장부 소모품 분류 합계 · 손익의 운영비로 들어가요 (원가에는 안 들어감)" />
            </span>
            <strong>
              {expenses
                ? won(
                    expenses
                      .filter((e) => e.category === 'supply' && e.date.startsWith(month))
                      .reduce((a, e) => a + e.amount, 0),
                  )
                : '-'}
            </strong>
          </div>
        </div>
      )}

      {kind === 'pack' && (
        <>
          <div className="section-head">
            <h3>포장 세트</h3>
            <span className="hint">제품의 기본 포장 · 판매 주문의 포장으로 골라요</span>
          </div>
          <div className="set-grid">
            {packSets.map((s) => (
              <SetCard key={s.id} set={s} parts={byId} onClick={() => setDialog({ kind: 'set', set: s })} />
            ))}
            <button className="set-card add" onClick={() => setDialog({ kind: 'set', set: null })}>
              + 포장 세트 추가
            </button>
          </div>
        </>
      )}

      <div className="section-head list-toolbar">
        <h3>{L} 목록</h3>
        <span className="hint">{list.length}개</span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="품목 · 구매처 · 비고 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select value={category} onChange={(e) => set({ category: e.target.value as ListFilter['category'] })}>
          <option value="">카테고리: 전체</option>
          {categories.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.name}
            </option>
          ))}
          {parts.some((p) => p.category == null) && <option value="none">미분류</option>}
        </select>
        {filtered && (
          <button
            className="btn small"
            onClick={() => set({ q: '', category: '', noPriceOnly: false, lowOnly: false })}
          >
            필터 지우기
          </button>
        )}
        <div className="view-tabs">
          {(['card', 'table'] as const).map((v) => (
            <button key={v} type="button" className={v === view ? 'active' : ''} onClick={() => changeView(v)}>
              {v === 'card' ? '카드' : '표'}
            </button>
          ))}
        </div>
      </div>
      {kind === 'supply' && (
        <p className="info-note">
          제품 원가에는 들어가지 않아요. 산 돈은 지출 장부 <b>소모품</b> 으로 손익에 들어가고, 여기서는 남은 개수만
          챙겨요.
        </p>
      )}

      {!list.length ? (
        <div className="table-wrap">
          <div className="empty">
            {parts.length ? `조건에 맞는 ${L} 없음` : `등록된 ${L} 없음 · ${L} 관리에서 추가`}
          </div>
        </div>
      ) : view === 'card' ? (
        <div className="cat-groups">
          {[...categories.map((c) => ({ key: c.id as number | null, name: c.name })), { key: null, name: '미분류' }]
            .map((g) => ({ ...g, items: list.filter((p) => p.category === g.key) }))
            .filter((g) => g.items.length)
            .map((g) => {
              const low = g.items.filter((p) => levelOf(p, alert) !== 'ok').length
              return (
                <section key={g.key ?? 'none'} className="cat-card">
                  <div className={g.key == null ? 'cat-title none' : 'cat-title'}>
                    <h4>{g.name}</h4>
                    <span className="m">
                      {L} <b>{parts.filter((p) => p.category === g.key).length}</b>개
                    </span>
                    {low > 0 && (
                      <span className="m warn">
                        부족 · 없음 <b>{low}</b>
                      </span>
                    )}
                  </div>
                  <div className="ptiles">
                    {g.items.map((p) => (
                      <Tile
                        key={p.id}
                        part={p}
                        alert={alert}
                        sub={`${p.shop || '구매처 없음'} · ${usedText(p)}`}
                        tip={usedTip(p)}
                        onOpen={() => setDialog({ kind: 'part', partId: p.id })}
                        onUse={kind === 'supply' ? () => spendOne(p) : undefined}
                      />
                    ))}
                    {!filtered && (
                      <button
                        type="button"
                        className="ptile add"
                        title={`${g.name} 에 ${L} 추가`}
                        onClick={() => setDialog({ kind: 'part', partId: null, category: g.key ?? undefined })}
                      >
                        <span>+</span>
                        {L}
                      </button>
                    )}
                  </div>
                </section>
              )
            })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="parts-table">
            <thead>
              <tr>
                <SortTh sortKey="name" {...th}>
                  품목
                </SortTh>
                <th>카테고리</th>
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
                  평균 단가
                </SortTh>
                <SortTh sortKey="stock" num {...th}>
                  남은 수량
                </SortTh>
                {kind === 'part' && (
                  <SortTh sortKey="used" num {...th}>
                    사용 제품
                  </SortTh>
                )}
                {kind === 'pack' && (
                  <SortTh sortKey="sets" num {...th}>
                    세트
                  </SortTh>
                )}
                {kind === 'supply' && (
                  <SortTh sortKey="lastUsed" {...th}>
                    마지막으로 다 씀
                  </SortTh>
                )}
                <th>비고</th>
                {kind === 'supply' && <th />}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const level = levelOf(p, alert)
                const n = kind === 'part' ? p.product_count : p.set_count
                return (
                  <tr key={p.id} onClick={() => setDialog({ kind: 'part', partId: p.id })}>
                    <td className="pname">
                      {p.name}
                      <BuyLink part={p} />
                      {level !== 'ok' && (
                        <>
                          {' '}
                          <span className={level === 'out' ? 'badge bad' : 'badge warn'}>
                            {level === 'out' ? '없음' : '부족'}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {p.category == null ? (
                        <span className="cat none">미분류</span>
                      ) : (
                        <span className="cat">{categoryName(p.category)}</span>
                      )}
                    </td>
                    <td>{p.shop || <span className="muted">-</span>}</td>
                    {/* 지출로 산 품목은 직접 넣은 구매가를 쓰지 않음 (단가는 지출 기록의 평균) */}
                    <td className="num">
                      {p.bought ? (
                        <span className="muted" title="지출로 산 품목 — 단가는 지출 기록의 평균">
                          지출
                        </span>
                      ) : p.price == null ? (
                        <span className="badge warn">미입력</span>
                      ) : (
                        won(p.price)
                      )}
                    </td>
                    <td className="num">
                      {p.bought ? (
                        <span className="muted">-</span>
                      ) : (
                        <>
                          {qty(p.pack_qty)}
                          {p.unit}
                        </>
                      )}
                    </td>
                    <td className="num unit-price" title="평균 단가 (원가 계산 · 판매 · 손익)">
                      {p.unit_price == null ? <span className="muted">-</span> : unitWon(p.unit_price)}
                    </td>
                    <td className="num">
                      <b className={`stock-num ${level}`}>
                        {qty(p.stock)}
                        {p.unit}
                      </b>
                    </td>
                    {kind === 'supply' ? (
                      <td className={p.last_used ? '' : 'muted'}>{p.last_used ? dotDate(p.last_used) : '-'}</td>
                    ) : n ? (
                      <td className="num used" title={usedTip(p)}>
                        {n}개
                      </td>
                    ) : (
                      <td className="num muted">-</td>
                    )}
                    <td className="note" title={p.note}>
                      {p.note}
                    </td>
                    {kind === 'supply' && (
                      <td>
                        <button
                          type="button"
                          className="btn small"
                          disabled={p.stock <= 0}
                          onClick={(e) => {
                            e.stopPropagation()
                            spendOne(p)
                          }}
                        >
                          1{p.unit} 다 씀
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'manage' && <ManageDialog kind={kind} onClose={closeDialog} />}
      {dialog?.kind === 'replace' && <ReplaceDialog parts={parts} usagesOf={usagesOf} onClose={closeDialog} />}
      {dialog?.kind === 'set' && (
        <PackSetDialog set={dialog.set} packs={parts} products={products} onClose={closeDialog} />
      )}
      {dialog?.kind === 'part' && renderPart(dialog.partId, dialog.category)}
    </>
  )

  // 품목이 지워졌으면(다른 창에서) 그리지 않는다
  function renderPart(id: number | null, preset?: number) {
    const part = id == null ? null : parts.find((p) => p.id === id)
    if (part === undefined) return null
    return (
      <PartDialog
        kind={kind}
        part={part}
        category={preset}
        categories={categories}
        parts={parts}
        usages={part ? usagesOf(part.id) : []}
        onClose={closeDialog}
      />
    )
  }
}

interface TileProps {
  part: Part
  alert: number // 이 탭의 부족 알림 기준
  sub: string // 구매처 · 사용 제품 수 (탭마다)
  tip: string
  onOpen: () => void
  onUse?: () => void // 소모품: `1개 다 씀`
}

// 사진 타일 (STOCK-02): 사진(없으면 첫 글자) · 부족/없음 배지 · 구매 링크 · 이름 · 구매처 · 남은 수량 · 개당 단가
function Tile({ part: p, alert, sub, tip, onOpen, onUse }: TileProps) {
  const level = levelOf(p, alert)
  return (
    // 안에 구매 링크 · 다 씀 버튼이 있어 button 대신 div (button 안에 a · button 을 넣을 수 없음)
    <div
      role="button"
      tabIndex={0}
      className={level === 'ok' ? 'ptile' : `ptile ${level}`}
      title={`${p.name} · 알림 기준 ${qty(alert)}${p.unit}${tip ? `\n${tip}` : ''}`}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <span className={p.photo ? 'photo' : 'photo none'}>
        {p.photo ? (
          <img src={p.photo} alt="" />
        ) : (
          <span>
            <b>{p.name[0]}</b>
            사진 없음
          </span>
        )}
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <BuyLink part={p} />
      </span>
      <span className="flag">
        {level === 'out' && <span className="badge bad">없음</span>}
        {level === 'low' && <span className="badge warn">부족</span>}
      </span>
      {onUse && (
        <button
          type="button"
          className="use"
          disabled={p.stock <= 0}
          title="하나를 다 써서 남은 수량에서 1 빼기"
          onClick={(e) => {
            e.stopPropagation()
            onUse()
          }}
        >
          1{p.unit} 다 씀
        </button>
      )}
      <span className="body">
        <span className="pn">{p.name}</span>
        <span className="sub">{sub}</span>
        <span className="foot">
          <span className="left">
            {qty(p.stock)}
            <small>{p.unit}</small>
          </span>
          <span className={p.unit_price == null ? 'uprice none' : 'uprice'} title="평균 단가 (원가 계산 · 판매 · 손익)">
            {p.unit_price == null ? '가격 미입력' : `${unitWon(p.unit_price)}/${p.unit}`}
          </span>
        </span>
      </span>
    </div>
  )
}

// 포장 세트 카드 (STOCK-06): 구성 · 세트 원가 · 기본 포장인 제품 수 · 바로 쌀 수 있는 수
function SetCard({ set, parts, onClick }: { set: PackSet; parts: Map<number, Part>; onClick: () => void }) {
  const n = canPack(set, parts)
  return (
    <button type="button" className="set-card" onClick={onClick}>
      <div className="head">
        <strong>{set.name}</strong>
        <span className="cost">{won(setCost(set, parts))}</span>
      </div>
      <ul>
        {set.lines.map((l) => {
          const p = parts.get(l.part)
          return (
            <li key={l.id} className={p && p.stock < l.qty ? 'short' : ''}>
              <span>{p?.name ?? '(지운 포장재)'}</span>
              <b>
                {qty(l.qty)}
                {p?.unit}
              </b>
            </li>
          )
        })}
      </ul>
      <div className="foot">
        <span>
          기본 포장인 제품 <b>{set.product_count}</b>
        </span>
        <span className={n ? '' : 'bad'}>
          바로 쌀 수 있음 <b>{n}</b>
        </span>
      </div>
    </button>
  )
}
