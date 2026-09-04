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
$keyId=Read-Host "Razorpay Test Key ID (rzp_test_...)"
$keySecret=ToPlain (Read-Host "Razorpay Test Key Secret" -AsSecureString)
$webhook=ToPlain (Read-Host "Razorpay Webhook Secret (optional; Enter for blank)" -AsSecureString)
$openrouter=ToPlain (Read-Host "OpenRouter API Key (optional; Enter for blank)" -AsSecureString)
if($keyId){SetEnvLine "RAZORPAY_KEY_ID" $keyId; SetEnvLine "NEXT_PUBLIC_RAZORPAY_KEY_ID" $keyId}
if($keySecret){SetEnvLine "RAZORPAY_KEY_SECRET" $keySecret}
SetEnvLine "RAZORPAY_WEBHOOK_SECRET" $webhook
SetEnvLine "OPENROUTER_API_KEY" $openrouter
