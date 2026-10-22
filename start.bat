@echo off
chcp 65001 >nul
rem 개발 서버 한 번에 켜기: 백엔드(Django) 창 + 프론트(Vite) 창을 따로 띄우고 브라우저를 연다.
rem 끄기: 각 창에서 Ctrl+C 또는 창 닫기
setlocal
set ROOT=%~dp0
set PY=%ROOT%.venv\Scripts\python.exe

if not exist "%PY%" (
  echo [오류] 가상환경이 없습니다. README 의 "로컬 실행 (백엔드)" 1번을 먼저 하세요.
  pause
  exit /b 1
)
if not exist "%ROOT%backend\.env" (
  echo [오류] backend\.env 가 없습니다. backend\.env.example 을 복사해서 값을 채우세요.
  pause
  exit /b 1
)

rem 다른 브랜치에서 받은 변경(모델 · 패키지)이 있어도 바로 돌아가도록 매번 맞춘다
echo DB 변경 사항 적용 중...
"%PY%" "%ROOT%backend\manage.py" migrate --no-input || (pause & exit /b 1)
echo 프론트 패키지 확인 중...
pushd "%ROOT%frontend"
call npm install --no-audit --no-fund || (popd & pause & exit /b 1)
popd

start "3D Farm Farm - backend" /d "%ROOT%backend" cmd /k ""%PY%" manage.py runserver"
start "3D Farm Farm - frontend" /d "%ROOT%frontend" cmd /k "npm run dev"

rem 개발 서버가 뜰 때까지 잠깐 기다렸다가 브라우저 열기
timeout /t 3 /nobreak >nul
start "" http://localhost:5173
endlocal
