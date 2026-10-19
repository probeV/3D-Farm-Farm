# 3D Farm Farm (쓰리디팜팜)

3D 프린팅 원가 계산 · 필라멘트 재고 관리 웹앱

> 🚧 Django 로 개발 중입니다.

## 주요 기능 (예정)
- **제품 원가 계산**: 필라멘트비, 전기료, 프린터 감가상각, 실패 보정, 부자재비, 스마트스토어 수수료를 반영한 순이익·마진율
- **필라멘트 재고**: 회사·재질별 필라멘트, 색상별 스풀 재고 (재고 / 사용 중 / 사용 완료), 스풀별 구매가
- **변경 이력과 되돌리기**: 스풀 상태 변경을 이력으로 남기고 동작 단위로 되돌리기
- **부자재 관리**: 자석, 나사, 포장재 등 묶음 구매가 → 개당 단가

## 기술 스택
- Python 3.10+, Django 5.2 (LTS)
- SQLite (로컬)

## 로컬 실행
```bash
# 1. 가상환경 + 의존성
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. 환경 변수: .env.example 을 .env 로 복사하고 DJANGO_SECRET_KEY 채우기
copy .env.example .env          # macOS/Linux: cp .env.example .env

# 3. DB 생성 + 관리자 계정
python manage.py migrate
python manage.py createsuperuser

# 4. 실행 → http://127.0.0.1:8000/admin/
python manage.py runserver
```

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
