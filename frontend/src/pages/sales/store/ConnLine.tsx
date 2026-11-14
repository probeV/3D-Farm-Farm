import type { Connection } from '../../../api/store'
import { dotDate } from '../../../format'

// 연결 상태 한 줄 (스마트스토어 연동 화면 위). 키는 서버의 키 파일에서 — 화면은 확인만, 자세한 건 설정 › 스마트스토어
export default function ConnLine({
  conn,
  loading,
  onSettings,
}: {
  conn: Connection | undefined
  loading: boolean
  onSettings: () => void
}) {
  if (loading || !conn) {
    return (
      <div className="st-conn">
        <span className="hint">연결 확인 중…</span>
      </div>
    )
  }
  const last = conn.last_import
  return (
    <div className="st-conn">
      {conn.state === 'ok' ? (
        <>
          <span className="st-dot" />
          <b>연결됨</b>
          <span className="muted">커머스API 내스토어 애플리케이션</span>
          <span className="sep" />
          <span>
            마지막 가져오기 <b>{last ? dotDate(last.created_at.slice(0, 16).replace('T', ' ')) : '없음'}</b>
          </span>
        </>
      ) : (
        <>
          <span className="st-dot off" />
          <b>{conn.state === 'nokey' ? '연결 안 됨' : '연결 실패'}</b>
          <span className="muted">
            {conn.state === 'nokey' ? '애플리케이션 ID · 시크릿이 없어요' : conn.detail || '네이버가 응답하지 않아요'}
          </span>
          <button type="button" className="btn small" onClick={onSettings}>
            {conn.state === 'nokey' ? '방법 보기' : '자세히'}
          </button>
        </>
      )}
    </div>
  )
}
