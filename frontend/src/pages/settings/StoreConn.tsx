import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { checkConnection, keys, useConnection } from '../../api/store'
import { useToast } from '../../components/useToast'
import { useNav } from '../../nav'

// 설정 › 스마트스토어 › 🔌 연결 (STORE-04). 키는 화면에서 넣지 않는다 — backend/.env 가 가리키는 키 파일에서 서버가 읽음
export default function StoreConn() {
  const conn = useConnection()
  const queryClient = useQueryClient()
  const toast = useToast()
  const nav = useNav()
  const [busy, setBusy] = useState(false)
  const state = conn.data?.state

  const test = async () => {
    setBusy(true)
    try {
      const res = await checkConnection()
      queryClient.setQueryData(keys.connection, res)
      toast(
        res.state === 'ok' ? '연결돼 있어요' : res.state === 'nokey' ? '아직 키가 없어요' : `연결 실패 · ${res.detail}`,
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : '확인하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const env = (
    <pre className="st-env">
      {
        '# backend/.env — 키 파일 경로만 (키는 프로젝트 밖에)\nNAVER_COMMERCE_KEY_FILE=C:/Users/이름/.keys/naver-commerce.env\n\n# 그 키 파일\nNAVER_CLIENT_ID=발급받은 애플리케이션 ID\nNAVER_CLIENT_SECRET=발급받은 애플리케이션 시크릿'
      }
    </pre>
  )

  return (
    <section className="group">
      <div className="group-head">
        <h4>🔌 연결</h4>
      </div>
      <div className="st-conn-row">
        {!conn.data ? (
          <span className="hint">연결 확인 중…</span>
        ) : (
          <>
            <span className={state === 'ok' ? 'st-dot' : 'st-dot off'} />
            <div>
              <b>{state === 'ok' ? '연결됨' : state === 'nokey' ? '연결 안 됨' : '연결 실패'}</b>
              <div className="hint">
                {state === 'ok'
                  ? '커머스API 내스토어 애플리케이션'
                  : state === 'nokey'
                    ? '애플리케이션 ID · 시크릿이 없어요'
                    : conn.data.detail || '네이버가 응답하지 않아요'}
              </div>
            </div>
          </>
        )}
        <div className="spacer" />
        <button type="button" className="btn small" onClick={() => nav.openStore()}>
          주문 가져오기 화면
        </button>
        <button type="button" className="btn small" disabled={busy} onClick={test}>
          연결 확인
        </button>
      </div>
      <div className="st-note">
        {state === 'ok' ? (
          <>
            ID · 시크릿은 <code>backend/.env</code> 의 <code>NAVER_COMMERCE_KEY_FILE</code> 이 가리키는 파일에서 읽어요.
            바꾸려면 그 파일을 고치고 서버를 다시 켜세요. 화면 · DB · 백업에는 저장되지 않아요.
          </>
        ) : state === 'nokey' ? (
          <>
            커머스API센터 › 애플리케이션 등록 › <b>내스토어 애플리케이션</b>(주문 조회 권한)을 발급받아 키 파일에 넣고,
            그 경로를 <code>backend/.env</code> 에 적은 뒤 서버를 다시 켜세요.
            {env}
          </>
        ) : (
          <>
            키 파일의 값이 커머스API센터의 값과 같은지 확인하세요. 시크릿을 다시 발급했다면 새 값으로 바꾸고 서버를 다시
            켜요.
            {env}
          </>
        )}
      </div>
    </section>
  )
}
