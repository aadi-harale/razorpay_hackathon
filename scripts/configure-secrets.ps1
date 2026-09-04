$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
if (!(Test-Path $envFile)) { throw ".env.local not found" }
function ToPlain([Security.SecureString]$s){$b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}}
function SetEnvLine([string]$name,[string]$value){
  $lines=Get-Content $envFile
  $escaped=$value.Replace('"','\"')
  $line = "$name=`"$escaped`""
  $found=$false
  $out=@(); foreach($l in $lines){if($l -match "^$([regex]::Escape($name))="){ $out += $line; $found=$true } else {$out += $l}}
  if(!$found){$out += $line}
  Set-Content -Path $envFile -Value $out -Encoding UTF8
}
Write-Host "RazorProcure local secret configuration" -ForegroundColor Cyan
$openrouter=ToPlain (Read-Host "OpenRouter API Key (optional; Enter for blank)" -AsSecureString)
SetEnvLine "PAYMENT_MODE" "demo"
SetEnvLine "RAZORPAY_KEY_ID" ""
SetEnvLine "RAZORPAY_KEY_SECRET" ""
SetEnvLine "RAZORPAY_WEBHOOK_SECRET" ""
SetEnvLine "NEXT_PUBLIC_RAZORPAY_KEY_ID" ""
SetEnvLine "OPENROUTER_API_KEY" $openrouter
Write-Host "External payment credentials cleared. Account-free demo payments are enabled." -ForegroundColor Green
