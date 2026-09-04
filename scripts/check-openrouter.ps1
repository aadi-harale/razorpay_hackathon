$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$envPath = Join-Path $root ".env.local"
if (!(Test-Path -LiteralPath $envPath)) { exit 1 }
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^OPENROUTER_API_KEY="?sk-') { exit 0 }
}
exit 1
