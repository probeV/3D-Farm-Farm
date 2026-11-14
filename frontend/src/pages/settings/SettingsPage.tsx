import { useEffect, useRef, useState, type ReactNode } from 'react'
import { updateCostSetting, useCostSetting, useRefreshProducts, type CostSetting } from '../../api/products'
import Help from '../../components/Help'
import { useToast } from '../../components/useToast'
import { won } from '../../format'
import { useForm } from '../../useForm'
import StoreConn from './StoreConn'
import {
  CATEGORIES,
  categoryOf,
  examples,
  initialValues,
  pickCategory,
  readValues,
  settingSchema,
  toText,
  type CalcKind,
  type CategoryKey,
  type SettingItem,
} from './schemas'

interface Props {
  tab: CategoryKey
  onTab: (tab: CategoryKey) => void
}

// 설정 화면 (PRD 3.8 · SYS-05, docs/screens.md 4장, 목업 docs/mockups/settings.html):
// 왼쪽 분류 | 오른쪽 설정 묶음 → 분류마다 저장 줄. 각 화면의 ⚙ 버튼은 자기 분류로 바로 온다
export default function SettingsPage(props: Props) {
  const { data, error, refetch } = useCostSetting()
  if (error) {
    return (
      <div className="empty">
        불러오지 못했어요: {error.message}{' '}
        <button className="btn small" onClick={() => refetch()}>
          다시 시도
        </button>
      </div>
    )
  }
  if (!data) return <div className="empty">불러오는 중…</div>
  // 저장된 값이 바뀌면(저장 후 다시 불러오기) 입력칸도 그 값으로 다시 시작
  return <SettingsForm key={JSON.stringify(data)} saved={data} {...props} />
}

type Leave = 'stay' | 'drop' | 'save'

function SettingsForm({ saved, tab, onTab }: Props & { saved: CostSetting }) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const form = useForm(settingSchema, initialValues(saved))
  const { values, busy, change, update, submit } = form
  const [leaving, setLeaving] = useState<CategoryKey | null>(null) // 저장 안 한 채 이 분류로 가려는 중
  const cat = categoryOf(tab)
  // 입력할 때마다 바로 검사 (저장 줄 · 틀린 칸 표시). 서버 오류(2차)는 다시 입력할 때까지 함께 보인다
  const { numbers, errors: live, changed } = readValues(values, saved, cat)
  const errors = { ...form.errors, ...live }
  const nErrors = Object.keys(errors).length
  const ex = examples(numbers)

  // 저장하지 않은 값이 있으면 브라우저를 닫거나 새로고침할 때 확인
  const dirty = changed.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])

  // 이 분류의 항목만 저장. 성공하면 true
  const save = async () => {
    let ok = false
    await submit(async (data) => {
      await updateCostSetting(pickCategory(data, cat))
      await refresh() // 제품 원가 · 판매 창이 이 값으로 다시 계산되도록 제품 쪽 목록도 함께
      toast(`${cat.label} 설정을 저장했어요 · ${cat.effect}`)
      ok = true
    })
    return ok
  }

  const reset = () => update(initialValues(saved))

  // 분류 바꾸기: 저장 안 한 변경이 있으면 확인 (취소 / 저장 안 하고 이동 / 저장하고 이동)
  const go = (next: CategoryKey) => {
    if (next === tab) return
    if (dirty) return setLeaving(next)
    onTab(next)
  }
  const answer = async (x: Leave) => {
    const next = leaving!
    setLeaving(null)
    if (x === 'stay') return
    if (x === 'save' && !(await save())) return // 저장 실패면 그 분류에 남아 오류를 본다
    if (x === 'drop') reset()
    onTab(next)
  }

  const row = (it: SettingItem) => {
    const err = errors[it.key]
    const isDefault = !err && numbers[it.key] === it.def
    return (
      <label key={it.key} className="setting">
        <span className="name">
          {it.name}
          {it.uses && (
            <span className="uses">
              {it.uses.map((u) => (
                <span key={u}>{u}</span>
              ))}
            </span>
          )}
          <span className="desc">
            {it.desc} · 기본 {toText(it.def)}
            {it.unit === '원' || it.unit === '%' ? it.unit : ` ${it.unit}`}
            {!isDefault && (
              <button
                type="button"
                className="btn link"
                onClick={(e) => {
                  e.preventDefault() // label 안이라 입력칸으로 커서가 가지 않게
                  change(it.key, toText(it.def))
                }}
              >
                기본값으로
              </button>
            )}
          </span>
        </span>
        <span className="with-suffix">
          <input
            inputMode="decimal"
            className={err ? 'invalid' : changed.includes(it.key) ? 'changed' : ''}
            value={values[it.key]}
            onChange={(e) => change(it.key, e.target.value)}
          />
          <em>{it.unit}</em>
        </span>
        {err && <span className="err">{err}</span>}
      </label>
    )
  }

  const calc: Record<CalcKind, ReactNode> = {
    elec: (
      <>
        1시간 출력 전기료 <b>{won(ex.hourElectricity)}</b>
      </>
    ),
    rec: (
      <>
        원가 1만원 제품 권장 판매가{' '}
        {ex.recommended10k ? (
          <b>{won(ex.recommended10k)}</b>
        ) : (
          <span className="warn">계산 불가 (수수료 + 목표 마진율이 100% 이상)</span>
        )}
        <Help tip="권장 판매가 = (원가 + 배송비) ÷ (1 − 수수료율 − 목표 마진율). 수수료 · 배송비는 스마트스토어 분류의 값" />
      </>
    ),
    fee: (
      <>
        수수료 합계 <b>{toText(ex.feeRate * 100)}%</b> · 2만원 판매 시 수수료 <b>{won(ex.fee20k)}</b>
      </>
    ),
  }

  return (
    <div className="settings">
      <nav className="set-cats" aria-label="설정 분류">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={c.key === tab ? 'set-cat on' : 'set-cat'}
            aria-current={c.key === tab ? 'page' : undefined}
            onClick={() => go(c.key)}
          >
            <span className="ico">{c.icon}</span>
            {c.label}
            {c.key === tab && dirty && <span className="dot" title="저장 안 한 변경" />}
          </button>
        ))}
      </nav>
      <section>
        <div className="cat-head">
          <h3>
            {cat.icon} {cat.label}
          </h3>
          <span className="hint">{cat.desc}</span>
        </div>
        <form
          className="groups"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && dirty && !nErrors) save()
          }}
        >
          {tab === 'store' && <StoreConn />}
          {cat.groups.map((g) => (
            <section key={g.title} className="group">
              <div className="group-head">
                <h4>
                  {g.icon} {g.title}
                </h4>
                <span className="calc">{calc[g.calc]}</span>
              </div>
              {g.items.map(row)}
            </section>
          ))}
          <div className={['save-bar', nErrors ? 'invalid' : dirty ? 'dirty' : ''].join(' ')}>
            <span className="msg">
              {nErrors
                ? `${nErrors}개 항목을 고쳐야 저장할 수 있어요`
                : dirty
                  ? `${cat.label} ${changed.length}개 항목을 바꿨어요 · 저장하면 ${cat.effect}`
                  : '바뀐 내용 없음'}
            </span>
            <div className="spacer" />
            <button
              type="button"
              className="btn"
              onClick={() => {
                reset()
                toast('저장된 값으로 되돌렸어요')
              }}
              disabled={!dirty || busy}
            >
              되돌리기
            </button>
            <button type="submit" className="btn primary" disabled={!dirty || nErrors > 0 || busy}>
              저장
            </button>
          </div>
        </form>
      </section>
      {leaving && <LeaveDialog label={cat.label} canSave={!nErrors} onAnswer={answer} />}
    </div>
  )
}

// 저장 안 한 채 다른 분류로 갈 때. 처음에는 `취소` 에 커서 (공통 확인 창 Confirm 과 같은 모양, 버튼만 셋)
function LeaveDialog({ label, canSave, onAnswer }: { label: string; canSave: boolean; onAnswer: (x: Leave) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) {
      el.showModal()
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="narrow confirm"
      onCancel={(e) => {
        e.preventDefault()
        onAnswer('stay')
      }}
    >
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <div className="dlg-head">
          <span className="title">저장하지 않은 변경</span>
        </div>
        <div className="dlg-body">
          <p className="lead">
            <b>{label}</b> 에서 바꾼 값을 저장하지 않았어요.
          </p>
        </div>
        <div className="dlg-foot">
          <button type="button" className="btn" data-autofocus onClick={() => onAnswer('stay')}>
            취소
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={() => onAnswer('drop')}>
            저장 안 하고 이동
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canSave}
            title={canSave ? undefined : '틀린 칸이 있어요'}
            onClick={() => onAnswer('save')}
          >
            저장하고 이동
          </button>
        </div>
      </form>
    </dialog>
  )
}
