# 3D Farm Farm (쓰리디팜팜)

3D 프린팅 원가 계산 · 필라멘트 재고 관리 웹앱

> 🚧 Django + React 로 개발 중입니다.

## 주요 기능 (예정)
- **제품 원가 계산**: 필라멘트비, 전기료, 프린터 감가상각, 실패 보정, 부자재비, 스마트스토어 수수료를 반영한 순이익·마진율
- **필라멘트 재고**: 회사·재질별 필라멘트, 색상별 스풀 재고 (재고 / 사용 중 / 사용 완료), 스풀별 구매가
- **변경 이력과 되돌리기**: 스풀 상태 변경을 이력으로 남기고 동작 단위로 되돌리기
- **부자재 관리**: 자석, 나사, 포장재 등 묶음 구매가 → 개당 단가

## 기술 스택
- 백엔드: Python 3.10+, Django 5.2 (LTS), Django REST Framework
- 프론트엔드: React + TypeScript + Vite, TanStack Query
- DB: SQLite (로컬)

## 폴더 구조
```
backend/    Django 프로젝트 (manage.py, config/)
frontend/   React 앱 (Vite)
docs/       PRD · ERD · 화면 명세 · 목업 · 코드 구조
```
무엇을 어디에 두는지는 [docs/architecture.md](docs/architecture.md) 참고.

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
- 개발 서버가 `/api`, `/admin`, `/static` 요청을 Django(`127.0.0.1:8000`)로 넘겨줘요 (`frontend/vite.config.ts`).
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
