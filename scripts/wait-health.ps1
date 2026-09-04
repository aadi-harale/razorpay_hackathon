$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
$portPath = Join-Path $root ".run\server.port"
$port = if (Test-Path $portPath) { [int](Get-Content $portPath | Select-Object -First 1) } else { 3100 }
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/api/health" -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
      $json = $response.Content | ConvertFrom-Json
      if ($json.app -eq "razorprocure" -and $json.status -eq "ok") { exit 0 }
    }
  } catch {}
  Start-Sleep -Milliseconds 500
}
exit 1
