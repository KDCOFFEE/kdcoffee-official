$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host '========================================'
Write-Host 'KD Coffee 7-ELEVEN 門市資料更新器'
Write-Host '========================================'
Write-Host ''
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 Node.js，請先安裝 Node.js。' -ForegroundColor Red
  Read-Host '按 Enter 結束'
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 npm。' -ForegroundColor Red
  Read-Host '按 Enter 結束'
  exit 1
}
& npm run update:711
$code = $LASTEXITCODE
Write-Host ''
if ($code -eq 0) {
  Write-Host '門市資料更新完成。' -ForegroundColor Green
} else {
  Write-Host '更新未完成，正式資料沒有被覆蓋。' -ForegroundColor Yellow
  Write-Host '請查看 data\711-update-report.json。'
}
Read-Host '按 Enter 結束'
exit $code
