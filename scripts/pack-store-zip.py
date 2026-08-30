"""스토어 제출용 zip — 항상 '/' 경로 구분자 (PAT-001: PowerShell Compress-Archive 는 역슬래시를 써서 스토어 업로드 500).

사용: python scripts/pack-store-zip.py   (저장소 루트에서, 먼저 `pnpm build` 로 프로덕션 dist 생성)
검사: dist 존재 · 로컬 endpoint(127.0.0.1:8787) 빌드 거부 · 엔트리 경로에 역슬래시 0
"""

import json
import os
import sys
import zipfile

BACKSLASH = chr(92)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
version = json.load(open(os.path.join(ROOT, "package.json"), encoding="utf-8"))[
    "version"
]
out = os.path.join(ROOT, f"snapcontext-v{version}.zip")

if not os.path.isdir(DIST) or not os.path.exists(os.path.join(DIST, "manifest.json")):
    sys.exit("dist/manifest.json 없음 — 먼저 pnpm build")

assets = os.path.join(DIST, "assets")
for d, _, fs in os.walk(assets):
    for f in fs:
        if f.endswith(".js"):
            with open(os.path.join(d, f), encoding="utf-8", errors="ignore") as fh:
                if "127.0.0.1:8787" in fh.read():
                    sys.exit(
                        f"dist 가 로컬 endpoint 빌드다 ({f}) — pnpm build 를 다시 돌려라"
                    )

count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for d, _, fs in os.walk(DIST):
        for f in fs:
            p = os.path.join(d, f)
            z.write(p, os.path.relpath(p, DIST).replace(os.sep, "/"))
            count += 1

bad = [n for n in zipfile.ZipFile(out).namelist() if BACKSLASH in n]
if bad:
    sys.exit(f"역슬래시 경로 {len(bad)}건 — ZIP 규격 위반")
print(f"{os.path.basename(out)}: {count} files, 경로 구분자 / 전수 확인")
