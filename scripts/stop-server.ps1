$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$pidPath = Join-Path $root ".run\server.pid"
$portPath = Join-Path $root ".run\server.port"

if (!(Test-Path -LiteralPath $pidPath)) {
  Write-Host "[RazorProcure] No recorded RazorProcure server process found."
  exit 0
}

$rawPid = (Get-Content -LiteralPath $pidPath | Select-Object -First 1).Trim()
$serverPid = 0
if (![int]::TryParse($rawPid, [ref]$serverPid) -or $serverPid -le 0) {
  throw "[RazorProcure] Invalid server PID file; refusing to stop an unknown process."
}

$processes = @(Get-CimInstance Win32_Process)
$rootProcess = $processes | Where-Object ProcessId -eq $serverPid | Select-Object -First 1
if (!$rootProcess) {
  Remove-Item -LiteralPath $pidPath -Force
  if (Test-Path -LiteralPath $portPath) { Remove-Item -LiteralPath $portPath -Force }
  Write-Host "[RazorProcure] Removed stale server state; no process was running."
  exit 0
}

function Get-Descendants([int]$parentPid) {
  $children = @($processes | Where-Object ParentProcessId -eq $parentPid)
  foreach ($child in $children) {
    Get-Descendants ([int]$child.ProcessId)
    $child
  }
}

$descendants = @(Get-Descendants $serverPid)
$projectServer = $descendants | Where-Object {
  $_.CommandLine -and
  $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
  $_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next.*\sstart(?:\s|$)"
} | Select-Object -First 1

if (!$projectServer) {
  throw "[RazorProcure] Recorded PID does not own this project's Next.js server; refusing to stop it."
}

foreach ($process in @($descendants) + @($rootProcess)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $pidPath -Force
if (Test-Path -LiteralPath $portPath) { Remove-Item -LiteralPath $portPath -Force }
Write-Host "[RazorProcure] Application server stopped."
