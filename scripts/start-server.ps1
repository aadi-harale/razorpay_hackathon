$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path ".run" | Out-Null
$port = 3100..3199 | Where-Object {
  @(Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue).Count -eq 0
} | Select-Object -First 1
if (!$port) { throw "[RazorProcure] No available port was found from 3100 through 3199." }

$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start -- -p $port > .run\server.log 2>&1" -WorkingDirectory $root -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500
$process.Refresh()
if ($process.HasExited) {
  $tail = if (Test-Path ".run\server.log") { (Get-Content ".run\server.log" -Tail 20) -join [Environment]::NewLine } else { "No server log was created." }
  throw "[RazorProcure] Server exited during startup.$([Environment]::NewLine)$tail"
}
Set-Content -Path ".run\server.pid" -Value $process.Id
Set-Content -Path ".run\server.port" -Value $port
Write-Host "[RazorProcure] Server process started on port $port."
