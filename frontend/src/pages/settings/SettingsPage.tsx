import { useEffect } from 'react'
import { updateCostSetting, useCostSetting, useRefreshProducts, type CostSetting } from '../../api/products'
import { useToast } from '../../components/useToast'
import { won } from '../../format'
import { useForm } from '../../useForm'
import { examples, GROUPS, initialValues, readValues, settingSchema, toText, type SettingItem } from './schemas'

// 제품 원가 설정 화면 (PRD 3.8, docs/screens.md 4장): 요약 한 줄 → 설정 묶음 → 저장 줄
export default function SettingsPage() {
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
  return <SettingsForm key={JSON.stringify(data)} saved={data} />
}

function SettingsForm({ saved }: { saved: CostSetting }) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const form = useForm(settingSchema, initialValues(saved))
  const { values, busy, change, update, submit } = form
  // 입력할 때마다 바로 검사 (저장 줄 · 틀린 칸 표시). 서버 오류(2차)는 다시 입력할 때까지 함께 보인다
  const { numbers, errors: live, changed, offDefault } = readValues(values, saved)
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

  const save = () =>
    submit(async (data) => {
      await updateCostSetting(data)
      await refresh() // 제품 원가가 이 값으로 다시 계산되도록 제품 쪽 목록도 함께
      toast('저장했어요 · 모든 제품 원가에 반영됐어요')
    })

  const reset = () => {
    update(initialValues(saved))
    toast('저장된 값으로 되돌렸어요')
  }

  const row = (it: SettingItem) => {
    const err = errors[it.key]
    const isDefault = !err && numbers[it.key] === it.def
    return (
      <label key={it.key} className="setting">
        <span className="name">
          {it.name}
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

  const calc = [
    <>
      1시간 출력 전기료 <b>{won(ex.hourElectricity)}</b>
    </>,
    <>
      수수료 합계 <b>{toText(ex.feeRate * 100)}%</b> · 원가 1만원 제품 권장 판매가{' '}
      {ex.recommended10k ? (
        <b>{won(ex.recommended10k)}</b>
      ) : (
        <span className="warn">계산 불가 (수수료 + 목표 마진율이 100% 이상)</span>
      )}
    </>,
  ]

  return (
    <div className="settings">
      <div className="top-row">
        <div className="stats">
          <span className={offDefault ? 'info' : ''}>
            기본값과 다른 항목<b>{offDefault}</b>
          </span>
        </div>
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
        {GROUPS.map((g, i) => (
          <section key={g.title} className="group">
            <div className="group-head">
              <h3>
                {g.icon} {g.title}
              </h3>
              <span className="calc">{calc[i]}</span>
            </div>
            {g.items.map(row)}
          </section>
        ))}
        <div className={['save-bar', nErrors ? 'invalid' : dirty ? 'dirty' : ''].join(' ')}>
          <span className="msg">
            {nErrors
              ? `${nErrors}개 항목을 고쳐야 저장할 수 있어요`
              : dirty
                ? `${changed.length}개 항목을 바꿨어요 · 저장하면 모든 제품 원가에 바로 반영돼요`
                : '바뀐 내용 없음'}
          </span>
          <div className="spacer" />
          <button type="button" className="btn" onClick={reset} disabled={!dirty || busy}>
            되돌리기
          </button>
          <button type="submit" className="btn primary" disabled={!dirty || nErrors > 0 || busy}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}
