# 3D Farm Farm (쓰리디팜팜)

3D 프린팅 원가 계산 · 재고 관리 · 판매 · 손익 웹앱

> 🚧 Django + React 로 개발 중입니다.

## 주요 기능
- **제품 원가 계산**: 필라멘트비, 전기료, 부속품비, 포장비, 스마트스토어 수수료를 반영한 순이익·마진율
- **재고 관리**: 필라멘트(색상별 스풀 · QR 라벨) · 부속품 · 포장재 · 소모품의 남은 수량, 평균 단가(이동평균)
- **지출 장부**: 분류별 지출, 반복 지출, 구매 항목으로 스풀 · 재고 자동 반영
- **판매 장부**: 주문 · 제품 · 부속품 · 포장 줄, 스마트스토어 주문 가져오기(커머스API)
- **손익**: 현금 기준 / 손익 기준, 투자 회수, 월별 그래프

## 기술 스택
- 백엔드: Python 3.10+, Django 5.2 (LTS), Django REST Framework
- 프론트엔드: React + TypeScript + Vite, TanStack Query, Zod (입력 검증)
- DB: SQLite (로컬)

## 폴더 구조
```
backend/    Django 프로젝트 (manage.py, config/)
frontend/   React 앱 (Vite)
docs/       PRD · ERD · 화면 명세 · 목업 · 코드 구조 · API
```
무엇을 어디에 두는지는 [docs/architecture.md](docs/architecture.md), API 는 [docs/api.md](docs/api.md) 참고.

## 바로 실행 (Windows)
처음 한 번 아래 "로컬 실행" 준비(가상환경 · `backend/.env` · Node.js)를 마친 뒤에는 저장소 루트의 **`start.bat`** 을 더블클릭하면 돼요.
- DB 변경 사항 적용(`migrate`) · 프론트 패키지 설치(`npm install`)를 한 뒤, 백엔드 · 프론트 서버를 각각 새 창으로 켜고 브라우저(`http://localhost:5173`)를 열어요.
- 끌 때는 두 서버 창을 닫거나 각 창에서 `Ctrl+C`.
- 같은 와이파이(공유기 안)의 폰 · 태블릿에서는 `http://PC내부IP:5173` (예: `http://172.30.1.77:5173`, `ipconfig` 의 IPv4 주소).
  아이폰 · 아이패드는 `http://PC이름.local:5173` 도 돼요. 공유기 없이 공인 IP 를 바로 받는 PC 라면 `frontend/vite.config.ts` 의 `host: true` 를 끄세요 (인터넷에 그대로 열림).
- QR 스풀 라벨(재고 관리 › 필라멘트 › `QR`)을 폰으로 찍으려면 `backend/.env` 에 `PUBLIC_URL=http://PC내부IP:5173` 을 넣고 서버를 다시 켜세요.
  QR 안에 이 주소가 들어가므로, 공유기에서 PC 주소를 고정(DHCP 예약)해 두면 붙인 라벨이 계속 열려요.
- 스마트스토어 주문 가져오기(판매 › `스마트스토어 가져오기`)는 커머스API센터의 **내스토어 애플리케이션** 키가 필요해요.
  프로젝트 밖 파일(예: `C:/Users/이름/.keys/naver-commerce.env`)에 `NAVER_CLIENT_ID=…` · `NAVER_CLIENT_SECRET=…` 두 줄을 넣고,
  `backend/.env` 에 `NAVER_COMMERCE_KEY_FILE=그 파일 경로` 를 적은 뒤 서버를 다시 켜세요. 연결은 설정 › 스마트스토어에서 확인해요.

## 로컬 실행 (백엔드)
```bash
# 1. 가상환경 (저장소 루트에 만들기) + 의존성
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
cd backend
pip install -r requirements-dev.txt   # 실행용(requirements.txt) + 개발 도구(Ruff)

# 2. 환경 변수: backend/.env.example 을 backend/.env 로 복사하고 DJANGO_SECRET_KEY 채우기
copy .env.example .env          # macOS/Linux: cp .env.example .env

# 3. DB 생성 + 관리자 계정 (backend/ 에서 실행)
python manage.py migrate
python manage.py createsuperuser

# 4. 실행 → http://127.0.0.1:8000/admin/
python manage.py runserver
```

## 로컬 실행 (프론트엔드)
Node.js 20 이상이 필요해요. 백엔드를 먼저 켜 두고, 다른 터미널에서:
```bash
cd frontend
npm install
npm run dev                     # → http://localhost:5173
```
- 개발 서버가 `/api`, `/admin`, `/static`, `/media` 요청을 Django(`127.0.0.1:8000`)로 넘겨줘요 (`frontend/vite.config.ts`).
- 공통 스타일은 `frontend/src/styles/app.css` (필라멘트 목업의 CSS 를 옮긴 것).

## 개발 규칙

### 브랜치 (Git Flow 간소화)
| 브랜치 | 만드는 곳 → 합치는 곳 | 용도 |
|---|---|---|
| `main` | — | 출시된 버전만. 병합 시 버전 태그 (`v0.1.0`) |
| `develop` | — | 개발 통합 브랜치 (기본 브랜치) |
| `feature/*` | `develop` → `develop` (PR) | 기능 개발. 예: `feature/django-setup` |
| `hotfix/*` | `main` → `main` + `develop` | 출시본 긴급 수정 |

- 출시: `develop` → `main` PR 병합 후 버전 태그
- 1인 개발이라 `release/*` 브랜치는 생략하고, 출시 준비는 `develop` 에서 마무리

### 코드 스타일
커밋 전에 포맷 → 검사 순서로 실행해요.

| 영역 | 도구 | 설정 파일 |
|---|---|---|
| 백엔드 | Ruff (린트 + 포맷) | `backend/pyproject.toml` |
| 프론트엔드 | Prettier (포맷) + ESLint (린트) | `frontend/.prettierrc.json`, `frontend/eslint.config.js` |
| 공통 | EditorConfig (들여쓰기·인코딩) | `.editorconfig` |

```bash
# 백엔드 (backend/ 에서)
ruff format .
ruff check --fix .

# 프론트엔드 (frontend/ 에서)
npm run format
npm run lint
```
- 공통: 작은따옴표, 한 줄 최대 120자. 프론트엔드는 세미콜론 없음
- `migrations/` 는 자동 생성 파일이라 검사하지 않아요

### 테스트
| 영역 | 도구 | 대상 |
|---|---|---|
| 백엔드 | Django `TestCase` | 모델 · API (`backend/<앱>/tests/`) |
| 프론트엔드 | Vitest (단위 테스트) | 입력 검증 규칙 · 재고 계산 · 표시 모양 (`*.test.ts`, 대상 파일 옆) |

```bash
# 백엔드 (backend/ 에서)
python manage.py test

# 프론트엔드 (frontend/ 에서)
npm test                        # 한 번 실행
npm run test:watch              # 파일을 고칠 때마다 다시 실행
```

### 커밋 메시지 (Conventional Commits)
`종류: 한 줄 요약`

| 종류 | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `docs` | 문서 |
| `test` | 테스트 |
| `chore` | 설정, 빌드, 기타 |

예: `feat: 필라멘트 스풀 재고 모델 추가`
