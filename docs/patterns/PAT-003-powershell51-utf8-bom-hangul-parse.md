---
id: PAT-003
패턴명: PowerShell 5.1 한글 스크립트는 UTF-8 BOM 필수
카테고리: env
증상: 한글 주석·문자열이 든 .ps1 실행 시 "The string is missing the terminator" 파서 에러. 에러 메시지의 한글이 "?꾨즺" 식으로 깨져 보임.
원인: PowerShell 5.1은 BOM 없는 파일을 ANSI(CP949)로 읽는다. UTF-8 한글 바이트를 CP949로 해석하다 특정 바이트가 뒤따르는 따옴표를 삼켜 문자열 터미네이터가 사라진다. 파일이 커지거나 한글 문자열이 추가될 때 갑자기 발생한다(기존엔 운 좋게 안 깨졌을 수 있음).
해결: .ps1 파일을 UTF-8 BOM으로 저장한다. `[IO.File]::WriteAllText($f, $t, [Text.UTF8Encoding]::new($true))`. 에디터·에이전트가 BOM 없는 UTF-8로 쓰는 게 기본값이라 한글 .ps1을 수정한 뒤에는 BOM 유지 여부를 확인한다.
적용조건: Windows PowerShell 5.1(powershell.exe)로 실행하는 모든 한글 포함 .ps1. pwsh(7+)는 BOM 없어도 UTF-8 기본이라 해당 없음.
출처프로젝트: snapcontext
태그: [powershell, encoding, bom, cp949, windows]
발견일: 2026-08-15
출처DevLog: 2026-08-15 0.4.2 P1 정합화 (커밋 c583d0d)
---

# PAT-003 — PowerShell 5.1 한글 스크립트는 UTF-8 BOM 필수

`scripts/e2e-smoke.ps1`에 한글 가드 문구를 추가하자 파서 에러 발생. 파일이 BOM 없는 UTF-8이어서 PS 5.1이 CP949로 읽다 문자열 따옴표를 삼킨 것. BOM 부여 즉시 해결(같은 리스크인 `register-mcp.ps1`도 함께 처리).

재현 판별법: 에러 출력에 한글이 모지바케(`?꾨즺` 등)로 보이면 이 패턴이다.
