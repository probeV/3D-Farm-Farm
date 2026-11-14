import type { Color } from '../../../api/filaments'
import type { Category, Product } from '../../../api/products'
import SortTh from '../../../components/SortTh'
import Swatch from '../../../components/Swatch'
import { gramsText, minutesText, pct, won } from '../../../format'
import { findSubcategory } from '../categories'
import { marginClass, type Catalog } from '../cost'
import StatusBadge from '../StatusBadge'
import type { ProductRow, Sort } from './productList'

// 색상 칸: 5개가 넘으면 4개 + "+N" (PRD-01a)
const MAX_SWATCH = 5

function Swatches({ colors }: { colors: Color[] }) {
  if (!colors.length) return <span className="muted">-</span>
  const shown = colors.length > MAX_SWATCH ? colors.slice(0, MAX_SWATCH - 1) : colors
  return (
    <span className="swatches" title={colors.map((c) => c.name).join(', ')}>
      {shown.map((c) => (
        <Swatch key={c.id} hex={c.hex} />
      ))}
      {colors.length > shown.length && <span className="more">+{colors.length - shown.length}</span>}
    </span>
  )
}

// 필라멘트 칸: 첫 필라멘트 이름 + "+N", 마우스를 올리면 전체 (필라멘트 · 색상 · 사용량)
function Filaments({ product, catalog }: { product: Product; catalog: Catalog }) {
  const ids = [...new Set(product.filaments.map((r) => r.filament))]
  if (!ids.length) return <td className="fils muted">-</td>
  const title = product.filaments
    .map((r) => {
      const color = r.color == null ? undefined : catalog.colors.get(r.color)
      return `${catalog.filaments.get(r.filament)?.display_name ?? ''}${color ? ` · ${color.name}` : ''} ${gramsText(r.grams)}g`
    })
    .join('\n')
  return (
    <td className="fils" title={title}>
      {catalog.filaments.get(ids[0])?.display_name}
      {ids.length > 1 && <small>+{ids.length - 1}</small>}
    </td>
  )
}

interface Props {
  rows: ProductRow[]
  categories: Category[]
  catalog: Catalog
  sort: Sort
  onSort: (key: Sort['key']) => void
  onOpen: (product: Product) => void
}

// 제품 표 (docs/screens.md 2.3). 행을 누르면 제품 수정 창, 열 제목을 누르면 정렬
export default function ProductTable({ rows, categories, catalog, sort, onSort, onOpen }: Props) {
  const th = { sort, onSort }
  return (
    <table>
      <thead>
        <tr>
          {/* 줄 번호: 지금 보이는 순서대로 1, 2, 3 … (저장 · 수정 없음) */}
          <th className="row-no">No.</th>
          <th>카테고리</th>
          <SortTh sortKey="name" {...th}>
            제품명
          </SortTh>
          <th>색상</th>
          <th>필라멘트</th>
          <SortTh sortKey="grams" num {...th}>
            사용량
          </SortTh>
          <SortTh sortKey="minutes" num {...th}>
            출력시간
          </SortTh>
          <SortTh sortKey="cost" num {...th}>
            원가
          </SortTh>
          <SortTh sortKey="price" num {...th}>
            판매가
          </SortTh>
          <SortTh sortKey="net" num {...th}>
            순이익
          </SortTh>
          <SortTh sortKey="margin" num {...th}>
            순마진율
          </SortTh>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ product: p, cost: c, colors }, i) => (
          <tr key={p.id} className={p.status === 'discontinued' ? 'discontinued' : ''} onClick={() => onOpen(p)}>
            <td className="row-no muted">{i + 1}</td>
            <td>
              {p.category == null ? (
                <span className="muted">미분류</span>
              ) : (
                categories.find((x) => x.id === p.category)?.name
              )}
              {p.subcategory != null && (
                <span className="sub-name"> › {findSubcategory(categories, p.subcategory)?.name}</span>
              )}
            </td>
            <td>
              <span className="pname">{p.name}</span>
              <StatusBadge status={p.status} />
            </td>
            <td>
              <Swatches colors={colors} />
            </td>
            <Filaments product={p} catalog={catalog} />
            <td className="num">{c.grams ? `${gramsText(c.grams)}g` : '-'}</td>
            <td className="num">{minutesText(p.print_minutes)}</td>
            <td className="num">{won(c.cost)}</td>
            <td className="num">{won(p.sale_price)}</td>
            <td className="num">{won(c.net)}</td>
            {/* 입력이 덜 된 제품은 순마진율 대신 배지 (빠진 항목은 마우스를 올리면) */}
            <td className={c.warnings.length ? 'num' : `num ${marginClass(c.margin)}`}>
              {c.warnings.length ? (
                <span className="badge warn" title={c.warnings.join('\n')}>
                  입력 필요
                </span>
              ) : (
                pct(c.margin)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
