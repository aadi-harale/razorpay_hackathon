$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$envPath = Join-Path $root ".env.local"
if (!(Test-Path -LiteralPath $envPath)) { throw "No local credentials yet. Run start.bat first." }

$values = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^(DEMO_EMAIL|DEMO_PASSWORD)=(.*)$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
    $values[$Matches[1]] = $value
  }
}
if (!$values.DEMO_EMAIL -or !$values.DEMO_PASSWORD) { throw "Local credentials are incomplete. Run start.bat again." }
Write-Host ("Email: " + $values.DEMO_EMAIL)
Write-Host ("Password: " + $values.DEMO_PASSWORD)
