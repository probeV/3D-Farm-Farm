import { useState } from 'react'
import { useBrands, useFilaments, useMaterials, type Brand, type Filament, type Material } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import ManageColumn from '../../../components/ManageColumn'
import { won } from '../../../format'
import BrandDialog from './BrandDialog'
import BrandLogo from '../BrandLogo'
import FilamentDialog from './FilamentDialog'
import MaterialDialog from './MaterialDialog'
import EditButton, { CopyButton } from '../../../components/EditButton'

type Tab = 'brands' | 'materials'

// 관리 창 위에 겹쳐 여는 창 (null = 추가, copyOf = 복제)
type Sub =
  | { kind: 'brand'; brand: Brand | null }
  | { kind: 'filament'; filament: Filament | null; copyOf?: Filament }
  | { kind: 'material'; material: Material | null }

// 필라멘트 관리 (PRD FIL-03, docs/screens.md 1.5)
// 회사·필라멘트 탭: 왼쪽 회사 목록 / 오른쪽 고른 회사의 필라멘트. 재질 탭: 재질 목록. 목록마다 따로 스크롤
export default function ManageDialog({ onClose }: { onClose: () => void }) {
  const brands = useBrands().data ?? []
  const materials = useMaterials().data ?? []
  const filaments = useFilaments().data ?? []
  const [tab, setTab] = useState<Tab>('brands')
  const [brandId, setBrandId] = useState<number | null>(null)
  const [sub, setSub] = useState<Sub | null>(null)
  const closeSub = () => setSub(null)

  // 고른 회사가 없거나 지워졌으면 첫 회사
  const brand = brands.find((b) => b.id === brandId) ?? brands[0]
  const brandFilaments = filaments.filter((f) => f.brand === brand?.id)

  // 색상이 있으면 지울 수 없어 확인 창 없이 이유만. 제품에서 쓰면 서버가 409 (PRD FIL-09)

  const tabs = (
    <div className="view-tabs">
      {(['brands', 'materials'] as const).map((t) => (
        <button key={t} type="button" className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
          {t === 'brands' ? '회사·필라멘트' : '재질'}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <Dialog size="wide" fixed title="필라멘트 관리" headExtra={tabs} onClose={onClose}>
        {tab === 'brands' ? (
          <div className="manage">
            <ManageColumn
              title="회사"
              count={brands.length}
              addLabel="+ 회사 추가"
              onAdd={() => setSub({ kind: 'brand', brand: null })}
            >
              <div className="list">
                {brands.map((b) => (
                  <div
                    key={b.id}
                    className={b.id === brand?.id ? 'list-item active' : 'list-item'}
                    onClick={() => setBrandId(b.id)}
                  >
                    <BrandLogo brand={b} />
                    <div className="grow">
                      <strong>{b.name}</strong>
                      <small>필라멘트 {b.filament_count}개</small>
                    </div>
                    <EditButton
                      onClick={(e) => {
                        e.stopPropagation() // 회사 선택까지 같이 되지 않도록
                        setSub({ kind: 'brand', brand: b })
                      }}
                    />
                  </div>
                ))}
              </div>
            </ManageColumn>
            {brand ? (
              <ManageColumn
                className="manage-right"
                title={`${brand.name} 의 필라멘트`}
                count={brandFilaments.length}
                addLabel="+ 필라멘트 추가"
                onAdd={() => setSub({ kind: 'filament', filament: null })}
              >
                {brandFilaments.map((f) => (
                  <div key={f.id} className="row-item fil-row">
                    <div>
                      <strong>{f.series ? `${f.material_name} ${f.series}` : f.material_name}</strong>
                      <div className="hint">색상 {f.colors.length}개</div>
                    </div>
                    <span className="muted">{f.price == null ? '가격 미입력' : `${won(f.price)} / ${f.spool_g}g`}</span>
                    <div className="row-btns">
                      <CopyButton onClick={() => setSub({ kind: 'filament', filament: null, copyOf: f })} />
                      <EditButton onClick={() => setSub({ kind: 'filament', filament: f })} />
                    </div>
                  </div>
                ))}
                {!brandFilaments.length && <p className="hint">등록된 필라멘트가 없어요.</p>}
              </ManageColumn>
            ) : (
              <div className="manage-right">
                <p className="hint">회사를 먼저 추가하세요.</p>
              </div>
            )}
          </div>
        ) : (
          <ManageColumn
            title="재질"
            count={materials.length}
            addLabel="+ 재질 추가"
            onAdd={() => setSub({ kind: 'material', material: null })}
          >
            {materials.map((m) => (
              <div key={m.id} className="row-item">
                <strong>{m.name}</strong>
                <span className="muted">필라멘트 {m.filament_count}개</span>
                <EditButton onClick={() => setSub({ kind: 'material', material: m })} />
              </div>
            ))}
            {!materials.length && <p className="hint">등록된 재질이 없어요.</p>}
          </ManageColumn>
        )}
      </Dialog>

      {/* 겹쳐 여는 창은 관리 창 안이 아니라 옆에 그린다 (form 안에 form 이 들어가지 않도록). 나중에 열린 창이 위에 뜬다 */}
      {sub?.kind === 'brand' && (
        <BrandDialog
          brand={sub.brand}
          onClose={closeSub}
          onSaved={(b) => setBrandId(b.id)}
          onDeleted={() => setBrandId(null)}
        />
      )}
      {sub?.kind === 'filament' && brand && (
        <FilamentDialog brand={brand} filament={sub.filament} copyOf={sub.copyOf} onClose={closeSub} />
      )}
      {sub?.kind === 'material' && <MaterialDialog material={sub.material} onClose={closeSub} />}
    </>
  )
}
