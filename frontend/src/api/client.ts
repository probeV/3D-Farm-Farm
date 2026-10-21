// 서버 호출 공통: /api/v0/ 아래 JSON 을 주고받는다 (docs/api.md)
const BASE = '/api/v0'

// 오류 응답 모양: 400 `{"name": ["..."]}` (칸별 메시지) / 404 · 409 `{"detail": "..."}`
export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(errorMessage(status, body))
    this.status = status
    this.body = body
  }
}

// 화면 알림에 띄울 한 줄: detail 이 있으면 그것, 없으면 첫 번째 칸의 첫 메시지
function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const values = Object.values(body as Record<string, unknown>)
    const first = 'detail' in body ? (body as { detail: unknown }).detail : values[0]
    const msg = Array.isArray(first) ? first[0] : first
    if (typeof msg === 'string') return msg
  }
  return `요청을 처리하지 못했습니다. (${status})`
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}
