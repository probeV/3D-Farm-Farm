// 테마: 시스템 / 라이트 / 다크 (TBD-10). 고른 값은 브라우저에 기억 (저장할 수 없는 환경이면 기억만 안 함)
// 색상 토큰은 styles/app.css (:root / :root[data-theme='dark'])
export type ThemePref = 'system' | 'light' | 'dark'

export const THEMES: { pref: ThemePref; label: string }[] = [
  { pref: 'system', label: '시스템' },
  { pref: 'light', label: '라이트' },
  { pref: 'dark', label: '다크' },
]

const KEY = 'pff-theme'
const darkMedia = matchMedia('(prefers-color-scheme: dark)')

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* 저장 불가 */
  }
}

// 화면에 적용. 시스템이면 시스템 설정이 바뀔 때도 바로 반영
let current: ThemePref = 'system'
const apply = () => {
  const dark = current === 'dark' || (current === 'system' && darkMedia.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}
darkMedia.addEventListener('change', apply)

export function applyTheme(pref: ThemePref) {
  current = pref
  apply()
}
