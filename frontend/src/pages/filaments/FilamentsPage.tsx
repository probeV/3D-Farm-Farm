import { useCallback, useRef, useState } from 'react'
import { useBrands, useFilaments, useMaterials, type ByStatus, type Color, type Filament } from '../../api/filaments'
import ColorDialog from './catalog/ColorDialog'
import ManageDialog from './catalog/ManageDialog'
import BrandSummary, { type BrandKg } from './list/BrandSummary'
import FilamentCard from './list/FilamentCard'
import TileMenu, { type TileAction } from './list/TileMenu'
import AdjustDialog from './spools/AdjustDialog'
import PickDialog from './spools/PickDialog'
import PurchaseDialog from './spools/PurchaseDialog'
import { colorState, filamentKg, heldOf, sumByStatus, totalOf } from './stock'

const SORTS = {
  name: '회사 이름순',
  stockDesc: '재고 많은 순',
  stockAsc: '재고 적은 순',
  totalDesc: '전체 많은 순',
} as const

type Sort = keyof typeof SORTS

interface Filter {
  q: string
  brand: number | null
  material: number | null
  sort: Sort
}

const NO_FILTER: Filter = { q: '', brand: null, material: null, sort: 'name' }

type DialogState =
  | { kind: TileAction; colorId: number } // 타일 메뉴에서
  | { kind: 'addColor'; filamentId: number } // `+ 색상` 타일에서
  | { kind: 'manage' } // `필라멘트 관리` 버튼에서

const byName = (a: string, b: string) => a.localeCompare(b, 'ko')

// 필라멘트 화면: 전체 요약 → 회사별 요약 → 필라멘트 목록 (docs/screens.md 1장)
export default function FilamentsPage() {
  const brands = useBrands()
  const materials = useMaterials()
  const filaments = useFilaments()
  const [filter, setFilter] = useState<Filter>(NO_FILTER)
  const toolbarRef = useRef<HTMLDivElement>(null)
  // 열린 타일 메뉴 · 대화상자. 색상 · 필라멘트는 id 로 기억하고 그릴 때마다 최신 데이터에서 찾는다 (저장하면 목록이 새로 옴)
  const [menu, setMenu] = useState<{ colorId: number; anchor: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  const failed = [brands, materials, filaments].find((r) => r.isError)
  if (failed) {
    return (
      <div className="empty">
        불러오지 못했어요: {failed.error.message}{' '}
        <button className="btn small" onClick={() => [brands, materials, filaments].forEach((r) => r.refetch())}>
          다시 시도
        </button>
      </div>
    )
  }
  if (!brands.data || !materials.data || !filaments.data) return <div className="empty">불러오는 중…</div>

  const fils = filaments.data
  // 목록이 바뀌면 열린 메뉴의 타일이 사라질 수 있으므로 메뉴를 닫는다
  const set = (patch: Partial<Filter>) => {
    setFilter((f) => ({ ...f, ...patch }))
    setMenu(null)
  }

  // 전체 요약 · 회사별 요약은 검색 · 필터와 무관하게 전체 기준
  const colors = fils.flatMap((f) => f.colors)
  const spools = sumByStatus(colors.map((c) => c.counts))
  const noStock = colors.filter((c) => colorState(c) === 'noStock').length
  const usedUp = colors.filter((c) => colorState(c) === 'usedUp').length

  // 회사별: 사용량(사용 중 + 사용 완료 kg) 많은 순 → 같으면 이름순 (PRD SUM-02)
  const brandItems: BrandKg[] = brands.data
    .map((brand) => ({ brand, kg: sumByStatus(fils.filter((f) => f.brand === brand.id).map(filamentKg)) }))
    .sort((a, b) => b.kg.open + b.kg.empty - (a.kg.open + a.kg.empty) || byName(a.brand.name, b.brand.name))

  const selectBrand = (id: number) => {
    set({ brand: filter.brand === id ? null : id })
    toolbarRef.current?.scrollIntoView({ block: 'start' })
  }

  const list = filterFilaments(fils, filter)
  const filtered = filter.q !== '' || filter.brand != null || filter.material != null

  // 같은 타일을 다시 누르면 닫고, 다른 타일이면 그 타일로 연다
  const onTile = (color: Color, anchor: HTMLElement) =>
    setMenu((m) => (m?.colorId === color.id ? null : { colorId: color.id, anchor }))
  const find = (colorId: number) => {
    const filament = fils.find((f) => f.colors.some((c) => c.id === colorId))
    const color = filament?.colors.find((c) => c.id === colorId)
    return filament && color ? { filament, color } : null
  }
  const menuTarget = menu && find(menu.colorId)

  return (
    <>
      <div className="top-row">
        <div className="stats">
          <span>
            재고 스풀<b>{spools.sealed}</b>
          </span>
          <span>
            사용 중<b>{spools.open}</b>
          </span>
          <span className={noStock ? 'warn' : ''} title="재고는 없고 사용 중인 스풀만 남은 색상">
            재고 없는 색상<b>{noStock}</b>
          </span>
          <span className={usedUp ? 'bad' : ''} title="재고도 사용 중인 스풀도 없는 색상">
            소진된 색상<b>{usedUp}</b>
          </span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog({ kind: 'manage' })}>
          필라멘트 관리
        </button>
      </div>

      {brandItems.length ? (
        <BrandSummary items={brandItems} selected={filter.brand} onSelect={selectBrand} />
      ) : (
        <div className="empty" style={{ marginTop: 18 }}>
          등록된 회사가 없어요.
        </div>
      )}

      <div className="section-head list-toolbar" ref={toolbarRef}>
        <h3>필라멘트 목록</h3>
        <span className="hint">{list.length}개</span>
        <div className="spacer" />
        <input
          type="search"
          placeholder="회사·재질·시리즈·색상 검색"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <select
          value={filter.brand ?? ''}
          onChange={(e) => set({ brand: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">회사: 전체</option>
          {brands.data.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={filter.material ?? ''}
          onChange={(e) => set({ material: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">재질: 전체</option>
          {materials.data.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={filter.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
          {Object.entries(SORTS).map(([v, label]) => (
            <option key={v} value={v}>
              정렬: {label}
            </option>
          ))}
        </select>
        {filtered && (
          <button className="btn small" onClick={() => set({ q: '', brand: null, material: null })}>
            필터 지우기
          </button>
        )}
      </div>

      {list.length ? (
        <div className="fil-list">
          {list.map((x) => (
            <FilamentCard
              key={x.filament.id}
              filament={x.filament}
              brand={brands.data.find((b) => b.id === x.filament.brand)}
              colors={x.colors}
              showAdd={x.selfMatch}
              selectedColor={menu?.colorId ?? null}
              onTile={onTile}
              onAddColor={(f) => setDialog({ kind: 'addColor', filamentId: f.id })}
            />
          ))}
        </div>
      ) : (
        <div className="empty">{fils.length ? '조건에 맞는 필라멘트가 없어요.' : '등록된 필라멘트가 없어요.'}</div>
      )}

      {menu && menuTarget && (
        <TileMenu
          color={menuTarget.color}
          anchor={menu.anchor}
          onPick={(kind) => {
            setMenu(null)
            setDialog({ kind, colorId: menu.colorId })
          }}
          onClose={closeMenu}
        />
      )}
      {renderDialog()}
    </>
  )

  // 열린 대화상자. 대상(색상 · 필라멘트)이 지워졌으면 그리지 않는다
  function renderDialog() {
    if (!dialog) return null
    if (dialog.kind === 'manage') return <ManageDialog onClose={closeDialog} />
    if (dialog.kind === 'addColor') {
      const filament = fils.find((f) => f.id === dialog.filamentId)
      return filament && <ColorDialog filament={filament} color={null} onClose={closeDialog} />
    }
    const target = find(dialog.colorId)
    if (!target) return null
    const { filament, color } = target
    switch (dialog.kind) {
      case 'purchase':
        return <PurchaseDialog filament={filament} color={color} onClose={closeDialog} />
      case 'pickOpen':
      case 'pickFinish':
        return <PickDialog color={color} mode={dialog.kind === 'pickOpen' ? 'open' : 'finish'} onClose={closeDialog} />
      case 'adjust':
        return <AdjustDialog color={color} onClose={closeDialog} />
      case 'editColor':
        return <ColorDialog filament={filament} color={color} onClose={closeDialog} />
    }
  }
}

interface Row {
  filament: Filament
  colors: Color[]
  selfMatch: boolean
  kg: ByStatus
}

const sorters: Record<Sort, (a: Row, b: Row) => number> = {
  name: (a, b) => byName(a.filament.display_name, b.filament.display_name),
  stockDesc: (a, b) => heldOf(b.kg) - heldOf(a.kg) || sorters.name(a, b),
  stockAsc: (a, b) => heldOf(a.kg) - heldOf(b.kg) || sorters.name(a, b),
  totalDesc: (a, b) => totalOf(b.kg) - totalOf(a.kg) || sorters.name(a, b),
}

// 검색 · 필터 · 정렬은 필라멘트 목록에만 적용 (PRD FND-04)
// 검색어가 회사 · 재질 · 시리즈에 걸리면 색상 전부, 색상 이름으로만 걸리면 그 색상만 보여 준다
function filterFilaments(fils: Filament[], filter: Filter) {
  const q = filter.q.trim().toLowerCase()
  const has = (...words: string[]) => words.join(' ').toLowerCase().includes(q)

  const toRow = (f: Filament): Row => {
    const selfMatch = !q || has(f.brand_name, f.material_name, f.series)
    const colors = selfMatch ? f.colors : f.colors.filter((c) => has(f.brand_name, f.material_name, f.series, c.name))
    return { filament: f, colors, selfMatch, kg: filamentKg(f) }
  }

  return fils
    .filter(
      (f) =>
        (filter.brand == null || f.brand === filter.brand) &&
        (filter.material == null || f.material === filter.material),
    )
    .map(toRow)
    .filter((x) => x.selfMatch || x.colors.length > 0)
    .sort(sorters[filter.sort])
}
