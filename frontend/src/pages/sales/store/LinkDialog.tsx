import { useState } from 'react'
import {
  createStoreLink,
  deleteStoreLink,
  updateStoreLink,
  useRefreshStore,
  useStoreLinks,
  type StoreLink,
} from '../../../api/store'
import Dialog from '../../../components/Dialog'
import { useToast } from '../../../components/useToast'

interface ProductOption {
  id: number
  name: string
  status: string
}

// 상품 연결 (STORE-02): 스토어 상품마다 이 앱의 제품을 한 번 짝지어 두면, 가져올 때 자동으로 그 제품으로.
// 옵션에 따라 제품이 다르면(예: `스위치: 적축`) 옵션 연결을 더한다 — 주문 옵션에 그 글자가 있으면 그 제품
export default function LinkDialog({ products, onClose }: { products: ProductOption[]; onClose: () => void }) {
  const links = useStoreLinks()
  const refresh = useRefreshStore()
  const toast = useToast()
  const [onlyNeed, setOnlyNeed] = useState(false)
  const [adding, setAdding] = useState<string | null>(null) // 옵션 연결을 더하는 스토어 상품번호
  const [option, setOption] = useState('')
  const [optProduct, setOptProduct] = useState('')

  const all = links.data ?? []
  const groups = [...new Set(all.map((l) => l.store_product_id))].map((pid) => ({
    pid,
    base: all.find((l) => l.store_product_id === pid && l.option === ''),
    options: all.filter((l) => l.store_product_id === pid && l.option !== ''),
  }))
  const need = groups.filter((g) => [g.base, ...g.options].some((l) => l && l.product == null))
  const shown = onlyNeed ? need : groups

  const run = async (work: () => Promise<unknown>, msg: string) => {
    try {
      await work()
      await refresh()
      toast(msg)
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요')
    }
  }
  const pick = (l: StoreLink, value: string) =>
    run(() => updateStoreLink(l.id, { product: value ? Number(value) : null }), '연결을 저장했어요')
  const addOption = (pid: string) =>
    run(async () => {
      await createStoreLink({
        store_product_id: pid,
        option: option.trim(),
        product: optProduct ? Number(optProduct) : null,
      })
      setAdding(null)
      setOption('')
      setOptProduct('')
    }, '옵션 연결을 더했어요')

  const select = (value: number | null, onChange: (v: string) => void, label: string) => (
    <select
      className={value == null ? 'need' : ''}
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">연결 안 함</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.status === 'developing' ? ' (개발중)' : p.status === 'discontinued' ? ' (판매중지)' : ''}
        </option>
      ))}
    </select>
  )

  return (
    <Dialog size="wide" fixed title="상품 연결" onClose={onClose}>
      <div className="st-map-filter">
        <button
          type="button"
          className={onlyNeed ? 'btn small' : 'btn small primary'}
          onClick={() => setOnlyNeed(false)}
        >
          전체 {groups.length}
        </button>
        <button
          type="button"
          className={onlyNeed ? 'btn small primary' : 'btn small'}
          onClick={() => setOnlyNeed(true)}
        >
          연결 필요 {need.length}
        </button>
        <span className="hint">
          한 번 짝지어 두면 가져올 때 자동으로 그 제품으로. 옵션마다 제품이 다르면 옵션 연결을 더해요 · 바꾸면 바로
          저장돼요
        </span>
      </div>
      {links.isLoading ? (
        <p className="hint">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="hint">
          {onlyNeed ? '연결이 필요한 상품이 없어요.' : '아직 가져온 스토어 상품이 없어요. 주문을 먼저 가져와요.'}
        </p>
      ) : (
        shown.map(({ pid, base, options }) => (
          <div key={pid} className="st-map-group">
            {base && (
              <div className="st-map-row">
                <div>
                  <div className="store-name">{base.store_name}</div>
                  <div className="hint">상품번호 {pid} · 기본 연결</div>
                </div>
                <span className="to">→</span>
                {select(base.product, (v) => pick(base, v), '이 앱의 제품')}
              </div>
            )}
            {options.map((l) => (
              <div key={l.id} className="st-map-row opt">
                <div>
                  <span className="st-opt-tag">옵션에 ‘{l.option}’ 이 있으면</span>
                  <button
                    type="button"
                    className="btn small st-x"
                    aria-label="옵션 연결 빼기"
                    onClick={() => run(() => deleteStoreLink(l.id), '옵션 연결을 뺐어요')}
                  >
                    ✕
                  </button>
                </div>
                <span className="to">→</span>
                {select(l.product, (v) => pick(l, v), '옵션 연결 제품')}
              </div>
            ))}
            {adding === pid ? (
              <div className="st-map-row opt">
                <input
                  autoFocus
                  placeholder="옵션 글자 (예: 스위치: 적축)"
                  value={option}
                  onChange={(e) => setOption(e.target.value)}
                />
                <span className="to">→</span>
                <div className="st-add">
                  {select(optProduct ? Number(optProduct) : null, setOptProduct, '옵션 연결 제품')}
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={!option.trim()}
                    onClick={() => addOption(pid)}
                  >
                    더하기
                  </button>
                  <button type="button" className="btn small" onClick={() => setAdding(null)}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn small st-add-opt" onClick={() => setAdding(pid)}>
                + 옵션 연결
              </button>
            )}
          </div>
        ))
      )}
    </Dialog>
  )
}
