$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "KD Coffee Launcher v5.2.2 Ultimate"

# The menu script is located in <Launcher>\Tools.
# Derive the launcher root locally; do not accept it from CMD arguments.
$ToolsDir = $PSScriptRoot
$Root = Split-Path -Parent $ToolsDir
$Core = Join-Path $ToolsDir "KD_LAUNCHER_CORE.ps1"
$ReportDir = Join-Path $Root "Reports\Launcher"

function Ensure-Directory([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "資料夾路徑為空白。"
  }
  [System.IO.Directory]::CreateDirectory($Path) | Out-Null
}

function Invoke-Core([string]$Mode) {
  & $Core -Mode $Mode -Root $Root
}

function Pause-Launcher {
  Write-Host ""
  Read-Host "按 Enter 返回主選單" | Out-Null
}

try {
  Ensure-Directory $ReportDir

  if (-not (Test-Path -LiteralPath $Core -PathType Leaf)) {
    throw "找不到核心檔案：$Core"
  }

  Invoke-Core "EnsureConfig"

  while ($true) {
    Clear-Host
    Invoke-Core "Banner"
    Write-Host ""
    Write-Host " 1. 啟動網站（開發模式）"
    Write-Host " 2. 更新網站（FULL / PATCH ZIP）"
    Write-Host " 3. 預覽更新內容"
    Write-Host " 4. 備份目前專案"
    Write-Host " 5. 還原備份"
    Write-Host " 6. 更新 7-ELEVEN 門市資料"
    Write-Host ""
    Write-Host " 7. npm install"
    Write-Host " 8. npm update"
    Write-Host " 9. 清除 Next.js Cache"
    Write-Host "10. 清除 node_modules 後重新安裝"
    Write-Host ""
    Write-Host "11. 啟動 ngrok（修正版：固定使用 ngrok.cmd / exe）"
    Write-Host "12. 開啟 localhost"
    Write-Host "13. 開啟 ngrok Dashboard"
    Write-Host "25. 手機測試（一鍵啟動網站 + ngrok）" -ForegroundColor Green
    Write-Host ""
    Write-Host "14. LINE Login 診斷"
    Write-Host "15. 環境檢查"
    Write-Host "16. 網站健康檢查"
    Write-Host ""
    Write-Host "17. 切換專案"
    Write-Host "18. 開啟專案資料夾"
    Write-Host "19. 開啟 VS Code / Cursor"
    Write-Host ""
    Write-Host "20. 建立客服診斷包"
    Write-Host "21. 關閉 KD Coffee 開發環境"
    Write-Host "22. 開啟完整使用說明"
    Write-Host "23. 開啟常見問題"
    Write-Host "24. 顯示目前版本資訊"
    Write-Host ""
    Write-Host " 0. 離開"
    Write-Host ""

    $choice = Read-Host "請輸入功能編號"

    $mode = switch ($choice) {
      "1"  { "StartSite" }
      "2"  { "UpdateZip" }
      "3"  { "PreviewZip" }
      "4"  { "Backup" }
      "5"  { "Restore" }
      "6"  { "Update711" }
      "7"  { "NpmInstall" }
      "8"  { "NpmUpdate" }
      "9"  { "ClearNext" }
      "10" { "RebuildModules" }
      "11" { "StartNgrok" }
      "12" { "OpenLocal" }
      "13" { "OpenNgrokDashboard" }
      "14" { "LineCheck" }
      "15" { "EnvCheck" }
      "16" { "HealthCheck" }
      "17" { "SwitchProject" }
      "18" { "OpenProject" }
      "19" { "OpenEditor" }
      "20" { "DiagnosticPack" }
      "21" { "StopDev" }
      "25" { "StartMobileTest" }
      default { $null }
    }

    if ($choice -eq "0") { break }

    if ($choice -eq "22") {
      Start-Process -FilePath (Join-Path $Root "使用說明")
      continue
    }

    if ($choice -eq "23") {
      Start-Process -FilePath (Join-Path $Root "使用說明\12_常見問題排除.txt")
      continue
    }

    if ($choice -eq "24") {
      Clear-Host
      Get-Content -LiteralPath (Join-Path $Root "VERSION.txt") -Encoding UTF8
      Pause-Launcher
      continue
    }

    if (-not $mode) {
      Write-Host "輸入無效，請重新選擇。" -ForegroundColor Yellow
      Start-Sleep -Seconds 1
      continue
    }

    try {
      Invoke-Core $mode
    }
    catch {
      $stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
      $report = Join-Path $ReportDir "${stamp}_menu_error.txt"
      @(
        "KD Coffee Launcher v5.2.2"
        "Root=$Root"
        "Mode=$mode"
        "Error=$($_.Exception.Message)"
        "Stack=$($_.ScriptStackTrace)"
      ) | Set-Content -LiteralPath $report -Encoding UTF8

      Write-Host ""
      Write-Host "執行失敗：$($_.Exception.Message)" -ForegroundColor Red
      Write-Host "錯誤報告：$report" -ForegroundColor Yellow
    }

    Pause-Launcher
  }
}
catch {
  try {
    Ensure-Directory $ReportDir
    $stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
    $report = Join-Path $ReportDir "${stamp}_startup_error.txt"
    @(
      "KD Coffee Launcher v5.2.2 startup failed"
      "ToolsDir=$ToolsDir"
      "Root=$Root"
      "Error=$($_.Exception.Message)"
      "Stack=$($_.ScriptStackTrace)"
    ) | Set-Content -LiteralPath $report -Encoding UTF8
  } catch {
    $report = "(無法建立錯誤報告)"
  }

  Write-Host ""
  Write-Host "Launcher 無法啟動：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "錯誤報告：$report" -ForegroundColor Yellow
  exit 1
}
