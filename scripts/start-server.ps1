$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path ".run" | Out-Null
$port = 3100

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $owners = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  throw "[RazorProcure] Port $port is already in use by PID(s) $($owners -join ', '). Stop the conflicting server before starting RazorProcure."
}

$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start -- -p $port > .run\server.log 2>&1" -WorkingDirectory $root -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500
$process.Refresh()
if ($process.HasExited) {
  $tail = if (Test-Path ".run\server.log") { (Get-Content ".run\server.log" -Tail 20) -join [Environment]::NewLine } else { "No server log was created." }
  throw "[RazorProcure] Server exited during startup.$([Environment]::NewLine)$tail"
}
Set-Content -Path ".run\server.pid" -Value $process.Id
Set-Content -Path ".run\server.port" -Value $port
