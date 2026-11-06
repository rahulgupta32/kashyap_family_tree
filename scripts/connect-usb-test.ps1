# Requires a trusted laptop running an isolated synthetic API on port 3010.
# Never expose PostgreSQL, Redis, email capture or test OTP endpoints publicly.
param(
  [Parameter(Mandatory=$true)][string]$Apk,
  [string]$Evidence = (Join-Path (Split-Path $Apk) 'evidence.json'),
  [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  [string]$Serial
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path $Adb)) { throw 'Android platform-tools adb.exe was not found. Pass -Adb with its installed path.' }
$manifest = Get-Content -LiteralPath $Evidence -Raw | ConvertFrom-Json
if ($manifest.applicationId -ne 'com.example.kashyap_mobile.usbtest' -or $manifest.apiOrigin -ne 'http://127.0.0.1:3010') {
  throw 'This helper accepts only the separately labelled loopback USB test APK.'
}
if ((Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) {
  throw 'APK checksum does not match evidence.json.'
}
try { $ready = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3010/health/ready' -TimeoutSec 5 }
catch { throw 'The laptop API is not ready at 127.0.0.1:3010. Start the isolated synthetic backend before installing.' }
if ($ready.StatusCode -ne 200) { throw 'The laptop API did not report readiness.' }
$deviceRows = @(& $Adb devices | Select-String '^([^\s]+)\s+device$' | ForEach-Object { $_.Matches[0].Groups[1].Value })
if ($LASTEXITCODE -ne 0) { throw 'adb devices failed.' }
if (!$Serial) {
  if ($deviceRows.Count -ne 1) { throw 'Authorize USB debugging on exactly one device, or pass -Serial explicitly.' }
  $Serial = $deviceRows[0]
}
if ($deviceRows -notcontains $Serial) { throw 'The selected phone is offline, unauthorized or not connected.' }
& $Adb -s $Serial reverse tcp:3010 tcp:3010
if ($LASTEXITCODE -ne 0) { throw 'USB reverse failed.' }
& $Adb -s $Serial install -r $Apk
if ($LASTEXITCODE -ne 0) { throw 'Installation failed. A differently debug-signed USB Test app may require manual removal; no app data was deleted automatically.' }
& $Adb -s $Serial shell am start -n 'com.example.kashyap_mobile.usbtest/com.example.kashyap_mobile.MainActivity'
if ($LASTEXITCODE -ne 0) { throw 'App launch failed.' }
Write-Host 'USB Test app launched. Keep the cable connected and the laptop backend running.'
Write-Host 'Login and full-app acceptance are still required. No real email or SMS delivery is implied.'
