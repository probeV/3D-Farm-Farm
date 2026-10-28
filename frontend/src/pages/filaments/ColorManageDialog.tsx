import { useState } from 'react'
import { useSpools, type Color, type Filament } from '../../api/filaments'
import Dialog from '../../components/Dialog'
import { kgText, won } from '../../format'
import { ColorFields, ColorHero } from './catalog/ColorDialog'
import { useColorEditor } from './catalog/useColorEditor'
import SpoolTable, { SpoolViewTabs, type SpoolView } from './spools/SpoolTable'
import { totalOf } from './stock'

type Tab = 'info' | 'spools'

interface Props {
  filament: Filament
  color: Color
  onClose: () => void
}

// 색상 · 스풀 관리 (TBD-13, docs/screens.md 1.6): 타일 메뉴의 톱니바퀴로 여는 창 하나에 `색상 정보` · `스풀` 탭.
// 색상 정보 탭은 `저장` 으로 저장, 스풀 탭은 지금처럼 바꾸면 바로 저장 (아래 버튼은 `닫기`).
// 탭을 바꿔도 입력 중인 색상 정보는 남는다. 창 높이는 고정 (탭을 바꿔도 크기가 그대로)
export default function ColorManageDialog({ filament, color, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('info')
  const [view, setView] = useState<SpoolView>('simple')
  const ed = useColorEditor(filament, color, onClose)
  const n = color.counts

  const header = (
    <div className="hub-head">
      {/* 두 탭의 머리를 같게: 창 이름 대신 색상 이름 */}
      <ColorHero title={color.name} filament={filament} hex={tab === 'info' ? ed.shown : color.hex} />
      <div className="hub-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')}>
          색상 정보
        </button>
        <button type="button" role="tab" aria-selected={tab === 'spools'} onClick={() => setTab('spools')}>
          스풀<small>{totalOf(n)}</small>
        </button>
        <span className="spacer" />
        {tab === 'spools' && <SpoolViewTabs view={view} onView={setView} />}
      </div>
    </div>
  )

  return (
    <Dialog
      header={header}
      size="wide"
      fixed
      onClose={onClose}
      submitLabel={tab === 'info' ? '저장' : undefined}
      onSubmit={tab === 'info' ? ed.save : undefined}
      busy={ed.busy}
      footerLeft={
        tab === 'info' && (
          <button type="button" className="btn danger" onClick={ed.remove}>
            삭제
          </button>
        )
      }
    >
      {tab === 'info' ? (
        <div className="hub-info">
          <ColorFields filament={filament} editor={ed} />
          <Summary filament={filament} color={color} using={ed.using} onSpools={() => setTab('spools')} />
        </div>
      ) : (
        <>
          <div className="hub-stock">
            <span>
              재고<b>{n.sealed}</b>
            </span>
            <span>
              사용 중<b>{n.open}</b>
            </span>
            <span>
              사용 완료<b>{n.empty}</b>
            </span>
          </div>
          <SpoolTable color={color} view={view} />
        </>
      )}
    </Dialog>
  )
}

interface SummaryProps {
  filament: Filament
  color: Color
  using: string[] // 이 색상을 쓰는 제품 이름
  onSpools: () => void
}

// 색상 정보 탭 오른쪽: 이 색상 요약 (스풀 · 남은 무게 · 평균 구매가 · 쓰는 제품). 삭제 전에 확인할 것들
function Summary({ filament, color, using, onSpools }: SummaryProps) {
  const spools = useSpools(color.id).data ?? []
  const n = color.counts
  // 평균 구매가: 재고 + 사용 중 스풀 중 구매가가 있는 것 (PRD INV-08 과 같은 기준)
  const held = spools.filter((s) => s.status !== 'empty' && s.price != null)
  const avg = held.length ? held.reduce((a, s) => a + (s.price ?? 0), 0) / held.length : null
  return (
    <aside className="hub-aside">
      <div>
        <h5>스풀 {totalOf(n)}개</h5>
        <div className="kv">
          <span>재고</span>
          <b>{n.sealed}</b>
        </div>
        <div className="kv">
          <span>사용 중</span>
          <b>{n.open}</b>
        </div>
        <div className="kv">
          <span>사용 완료</span>
          <b>{n.empty}</b>
        </div>
        <button type="button" className="go" onClick={onSpools}>
          스풀 탭에서 보기 →
        </button>
      </div>
      <div>
        <h5>남은 무게 · 구매가</h5>
        <div className="kv">
          <span>재고 + 사용 중</span>
          <b>{kgText(((n.sealed + n.open) * filament.spool_g) / 1000)}kg</b>
        </div>
        <div className="kv">
          <span>평균 구매가</span>
          <b>{won(avg)}</b>
        </div>
      </div>
      <div>
        <h5>쓰는 제품 {using.length}개</h5>
        {using.length ? (
          <ul>
            {using.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <span className="muted">없음</span>
        )}
      </div>
    </aside>
  )
}
