# SnapContext MCP를 Claude Code와 Codex에 등록한다.
# 토큰 원문을 명령 인자나 설정 파일에 넣지 않고 환경 변수 이름만 등록한다.
param(
  [switch]$Admin,
  [switch]$Local
)

$ErrorActionPreference = 'Stop'
$url = if ($Local) {
  'http://127.0.0.1:8787/mcp'
}
else {
  'https://snapcontext-worker.byh3071-26a.workers.dev/mcp'
}

if ($Admin) {
  if ([string]::IsNullOrWhiteSpace($env:SNAPCONTEXT_MCP_ADMIN_TOKEN)) {
    throw '운영체제 환경 변수 SNAPCONTEXT_MCP_ADMIN_TOKEN을 먼저 설정하고 새 터미널에서 다시 실행하세요.'
  }
  if ($env:SNAPCONTEXT_MCP_ADMIN_TOKEN.StartsWith('sc_')) {
    throw 'SNAPCONTEXT_MCP_ADMIN_TOKEN은 user sc_ 토큰 형식이면 안 됩니다.'
  }
  $tokenVariable = 'SNAPCONTEXT_MCP_ADMIN_TOKEN'
  Write-Host 'admin 읽기 복구용 연결을 등록합니다.' -ForegroundColor Yellow
}
else {
  if ([string]::IsNullOrWhiteSpace($env:SNAPCONTEXT_MCP_TOKEN)) {
    throw '운영체제 환경 변수 SNAPCONTEXT_MCP_TOKEN을 먼저 설정하고 새 터미널에서 다시 실행하세요.'
  }
  if (-not $env:SNAPCONTEXT_MCP_TOKEN.StartsWith('sc_')) {
    throw 'SNAPCONTEXT_MCP_TOKEN은 sc_로 시작해야 합니다.'
  }
  $tokenVariable = 'SNAPCONTEXT_MCP_TOKEN'
}

$literalHeader = 'Authorization: Bearer ${' + $tokenVariable + '}'
claude mcp add --scope user --transport http snapcontext $url --header $literalHeader
codex mcp add snapcontext --url $url --bearer-token-env-var $tokenVariable

Write-Host ''
Write-Host 'Claude Code와 Codex 등록 완료' -ForegroundColor Green
Write-Host 'Cursor는 확장 본문의 연결 안내에서 같은 환경 변수를 참조하는 설정을 복사하세요.'
Write-Host '환경 변수를 바꿨다면 터미널과 에디터를 완전히 재시작하세요.' -ForegroundColor Yellow
Write-Host '재시작 뒤 snap_history를 호출해 연결을 확인하세요.'
