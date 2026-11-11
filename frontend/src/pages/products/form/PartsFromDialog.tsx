import { useState } from 'react'
import type { Part, Product } from '../../../api/products'
import Dialog from '../../../components/Dialog'

interface Props {
  products: Product[] // 지금 고치는 제품은 빼고
  parts: Map<number, Part>
  existing: Set<number> // 이미 표에 있는 부자재 id (건너뜀)
  onPick: (partIds: number[]) => void
  onClose: () => void
}

// 다른 제품에서 부자재 가져오기 (TBD-22): 고른 제품의 부자재 항목만 넣는다. 수량은 넣은 뒤 직접 입력, 이미 있는 부자재는 건너뜀.
// 세트 · 연결은 하지 않는다 (넣은 뒤에는 보통 줄)
export default function PartsFromDialog({ products, parts, existing, onPick, onClose }: Props) {
  const candidates = products.filter((p) => p.parts.length).sort((a, b) => a.no - b.no)
  const [pickedId, setPickedId] = useState(candidates[0]?.id)
  const picked = candidates.find((p) => p.id === pickedId)
  // 같은 부자재 줄이 여러 개면 한 번만
  const partIds = [...new Set(picked?.parts.map((r) => r.part) ?? [])]
  const fresh = partIds.filter((id) => !existing.has(id))

  return (
    <Dialog
      size="wide"
      title="다른 제품에서 부자재 가져오기"
      onClose={onClose}
      submitLabel={!picked ? '넣기' : fresh.length ? `부자재 ${fresh.length}종 넣기` : '모두 이미 있어요'}
      busy={!fresh.length}
      onSubmit={() => onPick(fresh)}
    >
      {candidates.length ? (
        <div className="pick-prod">
          <div className="plist">
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === pickedId ? 'active' : ''}
                onClick={() => setPickedId(p.id)}
              >
                <span>{p.name}</span>
                <small>{new Set(p.parts.map((r) => r.part)).size}종</small>
              </button>
            ))}
          </div>
          <div className="preview">
            {picked && (
              <>
                <h4>{picked.name} 의 부자재</h4>
                {partIds.map((id) => {
                  const part = parts.get(id)
                  return (
                    <div key={id} className={existing.has(id) ? 'prow muted' : 'prow'}>
                      <span>{part?.name}</span>
                      <span>{existing.has(id) ? '이미 있음 · 건너뜀' : `${part?.unit ?? ''} 단위`}</span>
                    </div>
                  )
                })}
                <p className="hint">항목만 넣어요. 수량은 넣은 뒤 직접 입력하세요.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="hint">부자재를 쓰는 다른 제품이 없어요.</p>
      )}
    </Dialog>
  )
}
