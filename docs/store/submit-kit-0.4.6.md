# v0.4.6 제출 킷 — 복붙 전용 (2026-08-30, 일괄 재심사: 0.4.2 + 0.4.3 + 0.4.6)

> 스토어에 게시된 확장은 **0.3.0**(Chrome 2026-07-19 · Whale 2026-07-21 승인). 그 뒤 확장 코드가 세 번 바뀌었고(0.4.2 내 AI에 저장 · 0.4.3 그리기 도구 · 0.4.6 프롬프트 UX) 제출은 한 번도 안 했다 → **새 패키지 업로드 + 재심사** 1회로 몰아 낸다. 문구 정본 = `docs/store/listing-0.4.6.md`. 실제 제출은 사람.
> 서버(worker)는 이미 0.4.4가 배포돼 있고 이번 확장 0.4.6은 서버 무변경(ADR-014 2트랙) — 배포 선행 조건 없음.

## 0. 제출 전 사람 확인 (전부 ✔ 돼야 제출)

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | master = tag `v0.4.6`(코드 동결) | `git describe --tags` → `v0.4.6` |
| 2 | 릴리즈 게이트 | vitest 173 · E2E 6/6 · `dogfood:verify` 18/18 · `dogfood:qa043` 33/33 · `dogfood:qa046` 30/30 (2026-08-30 실측, `docs/state/next-task.md`) |
| 3 | 세 클라이언트(Claude Code·Cursor·Codex) `snap_history → snap_analyze → 이미지 판독` — `docs/dogfood.md` 릴리즈 게이트 절 | 0.4.6은 worker·MCP 무변경이라 0.4.4 스모크(7/7, 08-17)로 갈음 가능 — 다시 돌리면 더 좋음 |
| 4 | 스크린샷 5장이 현행 UI(요약 카드·버그/참고 토글·"내 AI에 저장"·저장됨 배지)인지 눈으로 확인 | `docs/store/chrome-web-store/screenshots/*.png` |
| 5 | 권한 변화 없음 | `manifest.json` permissions = sidePanel·storage·scripting·downloads·tabs·windows, host `<all_urls>` — 0.3.0 게시본과 동일하면 Privacy practices 재답변 불필요 |
| 6 | zip이 **슬래시 경로**로 만들어졌는지(PAT-001: PowerShell Compress-Archive 금지) | 아래 1단계 명령 사용 |

## 1. 패키지 zip 만들기 (프로덕션 빌드)

```powershell
# 저장소 루트, PowerShell
pnpm build                       # VITE_UPLOAD_ENDPOINT 기본(프로덕션) · version-sync 0.4.6 확인
python - <<'EOF'
import os, zipfile
root = 'dist'; out = 'snapcontext-v0.4.6.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, root).replace(os.sep, '/'))   # 항상 '/' (PAT-001)
print(out, sum(1 for _ in zipfile.ZipFile(out).namelist()), 'files')
EOF
```

> ⚠️ `dogfood:up`을 돌린 뒤라면 dist가 **로컬 endpoint(127.0.0.1:8787) 빌드**다. 반드시 `pnpm build`를 다시 돌려 프로덕션 빌드로 교체한 뒤 zip.
> 확인: `Select-String -Path dist/assets/*.js -Pattern "127.0.0.1:8787"` → 0건.

## 2. Chrome Web Store — https://chrome.google.com/webstore/devconsole

1. SnapContext 항목 → 좌측 **패키지** → **새 패키지 업로드** → `snapcontext-v0.4.6.zip`
2. 좌측 **스토어 등록정보** → 짧은 설명·상세 설명을 `listing-0.4.6.md`의 Chrome 블록으로 **전체 교체**
3. 스크린샷 5장 교체(01~05, 1280×800) — 기존 04 "공유 링크" 이미지는 반드시 삭제
4. **개인정보 보호 관행** 탭: 권한 변화 없음(0.3.0과 동일) — 데이터 사용 답변은 `listing-0.4.6.md` "Privacy practices 입력 기준"과 대조만
5. 심사 메모(있으면): "0.4.2에서 공개 공유 링크를 폐지하고 사용자 토큰으로 격리된 비공개 저장으로 전환. 0.4.4 서버에서 구 공개 경로는 410으로 영구 폐쇄. 개인정보처리방침 갱신: docs/PRIVACY.md"
6. 우측 상단 **심사를 위해 제출**

## 3. 네이버 웨일 스토어 — 개발자 센터

1. SnapContext 항목 → 새 버전 zip 업로드(같은 zip)
2. 설명을 `listing-0.4.6.md`의 **웨일 평문판**으로 전체 교체
3. 스크린샷 5장 교체 · 분류 생산성 · 성인콘텐츠 아니요 → 제출

## 4. 제출 후

- `TASKS.md`의 "재심사 준비" 항목을 제출일·심사 상태로 갱신, 승인되면 `docs/changelog.md` 0.4.6 절에 "스토어 게시 YYYY-MM-DD" 1줄
- 승인 메일 실측 뒤 `docs/로드맵.md` 트랙 F "재심사" 칸 ✅
- `scripts/check-goal-6.mjs`의 `docs/store/archive/` 제외는 유지(과거 기록), 현행 킷은 게이트 검사 대상
