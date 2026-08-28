param(
  [Parameter(Mandatory=$true)]
  [ValidateSet(
    "EnsureConfig","Banner","StartSite","UpdateZip","PreviewZip","Backup","Restore",
    "Update711","NpmInstall","NpmUpdate","ClearNext","RebuildModules","StartNgrok","StartMobileTest",
    "OpenLocal","OpenNgrokDashboard","LineCheck","EnvCheck","HealthCheck",
    "SwitchProject","OpenProject","OpenEditor","DiagnosticPack","StopDev"
  )]
  [string]$Mode,
  [Parameter(Mandatory=$true)]
  [string]$Root
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Root = $Root.Trim().Trim('"').TrimEnd('\')
if ([string]::IsNullOrWhiteSpace($Root)) {
  throw "Launcher 根目錄為空白。"
}
if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  throw "Launcher 根目錄不存在：$Root"
}
$Root = (Get-Item -LiteralPath $Root).FullName
$ConfigPath = Join-Path $Root "KD_LAUNCHER_CONFIG.json"
$Picker = Join-Path $Root "Tools\KD_PICKER.ps1"
$Backups = Join-Path $Root "Backups"
$UpdateReports = Join-Path $Root "UpdateReports"
$Reports = Join-Path $Root "Reports"
$Version = "5.2.2"

function Timestamp { Get-Date -Format "yyyy-MM-dd_HHmmss" }

function Resolve-NgrokCommand($Project) {
  $candidates = @(
    (Join-Path $Project "ngrok.exe"),
    (Join-Path $Root "ngrok.exe"),
    (Join-Path $env:APPDATA "npm\ngrok.cmd")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return (Get-Item -LiteralPath $candidate).FullName
    }
  }

  $cmd = Get-Command ngrok.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }

  $exe = Get-Command ngrok.exe -ErrorAction SilentlyContinue
  if ($exe -and $exe.Source) { return $exe.Source }

  return $null
}

function Test-PortListening([int]$Port) {
  try {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
  } catch {
    return $false
  }
}

function Save-Json($Path, $Object) {
  $Object | ConvertTo-Json -Depth 10 | Set-Content -Path $Path -Encoding UTF8
}

function Load-Config {
  if (-not (Test-Path $ConfigPath)) { return $null }
  try { return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { return $null }
}

function Pick-Folder {
  $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $Picker -Mode Folder
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($result | Select-Object -Last 1)
}

function Pick-Zip {
  $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $Picker -Mode Zip
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($result | Select-Object -Last 1)
}

function Ensure-Config {
  $config = Load-Config
  if ($config -and $config.projectDir -and (Test-Path (Join-Path $config.projectDir "package.json"))) {
    return $config
  }

  # Launcher is bundled inside the project. Prefer the parent folder automatically.
  $project = Split-Path -Parent $Root
  if (-not (Test-Path (Join-Path $project "package.json"))) {
    Write-Host "找不到內建網站專案，請選擇 KD Coffee 網站專案資料夾。" -ForegroundColor Cyan
    $project = Pick-Folder
    if (-not $project) { throw "未選擇專案資料夾。" }
    if (-not (Test-Path (Join-Path $project "package.json"))) {
      throw "選擇的資料夾不是有效專案，最外層找不到 package.json。"
    }
  } else {
    Write-Host "已自動找到網站專案：$project" -ForegroundColor Green
  }

  $obj = [ordered]@{
    launcherVersion = $Version
    projectDir = $project
    mode = "LOCAL DEVELOPMENT"
    lastUpdated = (Get-Date).ToString("s")
  }
  Save-Json $ConfigPath $obj
  return [pscustomobject]$obj
}

function Get-Project {
  return (Ensure-Config).projectDir
}

function Read-PackageVersion($Project) {
  try {
    $pkg = Get-Content (Join-Path $Project "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pkg.version) { return [string]$pkg.version }
  } catch {}
  return "未知"
}

function Read-ProjectTitle($Project) {
  $v = Join-Path $Project "VERSION.md"
  if (Test-Path $v) {
    $line = Get-Content $v -Encoding UTF8 | Where-Object { $_.Trim() } | Select-Object -First 1
    if ($line) { return $line.Trim("# ").Trim() }
  }
  return "KD Coffee Studio"
}

function Write-Report($Category, $Name, $Lines) {
  $dir = Join-Path $Reports $Category
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $path = Join-Path $dir ("{0}_{1}.txt" -f (Timestamp), $Name)
  $Lines | Set-Content -Path $path -Encoding UTF8
  return $path
}

function Expand-ZipManual($ZipPath, $Destination) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $rootFull = [System.IO.Path]::GetFullPath($Destination)
  if (-not $rootFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootFull += [System.IO.Path]::DirectorySeparatorChar
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($name.IndexOf([char]0) -ge 0) { continue }

      $candidate = Join-Path $Destination $name
      try { $destFull = [System.IO.Path]::GetFullPath($candidate) }
      catch { continue }

      if (-not $destFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) { continue }

      if ([string]::IsNullOrEmpty($entry.Name)) {
        New-Item -ItemType Directory -Force -Path $destFull | Out-Null
        continue
      }

      $parent = Split-Path -Parent $destFull
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destFull, $true)
    }
  }
  finally {
    $archive.Dispose()
  }
}

function Find-SourceRoot($Temp) {
  if (Test-Path (Join-Path $Temp "KD_UPDATE_MANIFEST.json")) { return $Temp }
  if (Test-Path (Join-Path $Temp "package.json")) { return $Temp }
  $dirs = @(Get-ChildItem $Temp -Directory -Force)
  $files = @(Get-ChildItem $Temp -File -Force)
  if ($dirs.Count -eq 1 -and $files.Count -eq 0) { return $dirs[0].FullName }
  foreach ($d in $dirs) {
    if (Test-Path (Join-Path $d.FullName "package.json")) { return $d.FullName }
    if (Test-Path (Join-Path $d.FullName "KD_PATCH_MARKER.txt")) { return $d.FullName }
    if (Test-Path (Join-Path $d.FullName "KD_UPDATE_MANIFEST.json")) { return $d.FullName }
  }
  return $Temp
}

function Detect-PackageType($Source, $ZipPath) {
  $manifest = Join-Path $Source "KD_UPDATE_MANIFEST.json"
  if (Test-Path $manifest) {
    try {
      $m = Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($m.packageType -in @("FULL","PATCH")) { return $m.packageType }
    } catch {}
  }
  if (Test-Path (Join-Path $Source "KD_PATCH_MARKER.txt")) { return "PATCH" }
  if ([System.IO.Path]::GetFileName($ZipPath) -match "PATCH") { return "PATCH" }
  if (Test-Path (Join-Path $Source "package.json")) { return "FULL" }
  return "PATCH"
}

function Get-Manifest($Source) {
  $path = Join-Path $Source "KD_UPDATE_MANIFEST.json"
  if (-not (Test-Path $path)) { return $null }
  try { return Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { return $null }
}

function Compare-Versions($a, $b) {
  try { return ([version]$a).CompareTo([version]$b) } catch { return 0 }
}

function Test-Compatibility($Project, $Manifest) {
  if (-not $Manifest) { return $true }
  $current = Read-PackageVersion $Project
  if ($Manifest.minimumBaseVersion -and $current -ne "未知") {
    if ((Compare-Versions $current $Manifest.minimumBaseVersion) -lt 0) {
      throw "更新包需要至少版本 $($Manifest.minimumBaseVersion)，目前版本為 $current。"
    }
  }
  return $true
}

function Get-ChangeSummary($Source, $Project) {
  $added = New-Object System.Collections.Generic.List[string]
  $modified = New-Object System.Collections.Generic.List[string]
  $same = 0
  $skip = @("node_modules",".next",".git","KD_UPDATE_MANIFEST.json","KD_PATCH_MARKER.txt")

  Get-ChildItem $Source -File -Recurse -Force | ForEach-Object {
    $rel = $_.FullName.Substring($Source.Length).TrimStart('\','/')
    $first = ($rel -split '[\\/]')[0]
    if ($first -in $skip) { return }
    $target = Join-Path $Project $rel
    if (-not (Test-Path $target)) { $added.Add($rel); return }
    try {
      if ((Get-FileHash $_.FullName -Algorithm SHA256).Hash -ne (Get-FileHash $target -Algorithm SHA256).Hash) {
        $modified.Add($rel)
      } else { $script:same++ }
    } catch { $modified.Add($rel) }
  }

  return [pscustomobject]@{
    Added = $added
    Modified = $modified
    Same = $same
  }
}

function New-Backup($Project, $Prefix="manual") {
  New-Item -ItemType Directory -Force -Path $Backups | Out-Null
  $dest = Join-Path $Backups ("{0}_{1}" -f $Prefix,(Timestamp))
  New-Item -ItemType Directory -Force -Path $dest | Out-Null

  Get-ChildItem $Project -Force | Where-Object {
    $_.Name -notin @("node_modules",".next")
  } | ForEach-Object {
    Copy-Item $_.FullName $dest -Recurse -Force
  }
  return $dest
}

function Copy-TreeMerge($Source, $Destination) {
  Get-ChildItem $Source -Force | ForEach-Object {
    $dest = Join-Path $Destination $_.Name
    if ($_.PSIsContainer) {
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Copy-TreeMerge $_.FullName $dest
    } else {
      Copy-Item $_.FullName $dest -Force
    }
  }
}


function New-PatchRollback($Project, $Summary) {
  $rollback = Join-Path $env:TEMP ("kdcoffee_patch_rollback_" + (Timestamp))
  $filesDir = Join-Path $rollback "files"
  New-Item -ItemType Directory -Force -Path $filesDir | Out-Null

  foreach ($rel in $Summary.Modified) {
    $source = Join-Path $Project $rel
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      $target = Join-Path $filesDir $rel
      $parent = Split-Path -Parent $target
      if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
      Copy-Item -LiteralPath $source -Destination $target -Force
    }
  }

  @($Summary.Added) | Set-Content -LiteralPath (Join-Path $rollback "added.txt") -Encoding UTF8
  return $rollback
}

function Restore-PatchRollback($Project, $Rollback) {
  $addedList = Join-Path $Rollback "added.txt"
  if (Test-Path -LiteralPath $addedList) {
    Get-Content -LiteralPath $addedList -Encoding UTF8 | Where-Object { $_ } | ForEach-Object {
      $target = Join-Path $Project $_
      if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }

  $filesDir = Join-Path $Rollback "files"
  if (Test-Path -LiteralPath $filesDir) { Copy-TreeMerge $filesDir $Project }
}

function Apply-Patch($Source, $Project) {
  Get-ChildItem $Source -Force | Where-Object {
    $_.Name -notin @("KD_PATCH_MARKER.txt","KD_UPDATE_MANIFEST.json","更新說明.txt","README.txt")
  } | ForEach-Object {
    $dest = Join-Path $Project $_.Name
    if ($_.PSIsContainer) {
      New-Item -ItemType Directory -Force -Path $dest | Out-Null
      Copy-TreeMerge $_.FullName $dest
    } else {
      Copy-Item $_.FullName $dest -Force
    }
  }
}

function Apply-Full($Source, $Project) {
  $protect = @(".env.local","node_modules","data","public","ngrok.exe","START_KD_COFFEE.bat")
  $stash = Join-Path $env:TEMP ("kdcoffee_preserve_" + (Timestamp))
  New-Item -ItemType Directory -Force -Path $stash | Out-Null

  foreach ($item in $protect) {
    $p = Join-Path $Project $item
    if (Test-Path $p) { Copy-Item $p $stash -Recurse -Force }
  }

  Get-ChildItem $Project -Force | Where-Object { $_.Name -notin $protect } | Remove-Item -Recurse -Force
  Get-ChildItem $Source -Force | Where-Object {
    $_.Name -notin @("node_modules",".next","KD_UPDATE_MANIFEST.json")
  } | ForEach-Object {
    Copy-Item $_.FullName $Project -Recurse -Force
  }

  foreach ($item in $protect) {
    $p = Join-Path $stash $item
    if (Test-Path $p) { Copy-Item $p $Project -Recurse -Force }
  }
  Remove-Item $stash -Recurse -Force -ErrorAction SilentlyContinue
}

function Invoke-HealthCheck($Project, [switch]$Quiet) {
  $checks = New-Object System.Collections.Generic.List[object]
  function AddCheck($Name,$Ok,$Detail) {
    $checks.Add([pscustomobject]@{Name=$Name;Ok=$Ok;Detail=$Detail})
  }

  AddCheck "package.json" (Test-Path (Join-Path $Project "package.json")) "專案根目錄"
  AddCheck "app" (Test-Path (Join-Path $Project "app")) "Next.js App Router"
  AddCheck "components" (Test-Path (Join-Path $Project "components")) "元件資料夾"
  AddCheck ".env.local" (Test-Path (Join-Path $Project ".env.local")) "環境設定"
  AddCheck "node_modules" (Test-Path (Join-Path $Project "node_modules")) "npm 套件"
  AddCheck "首頁路由" (Test-Path (Join-Path $Project "app\page.tsx")) "app/page.tsx"
  AddCheck "作品路由" (Test-Path (Join-Path $Project "app\works")) "app/works"
  AddCheck "購物車路由" (Test-Path (Join-Path $Project "app\cart")) "app/cart"
  AddCheck "結帳路由" (Test-Path (Join-Path $Project "app\checkout")) "app/checkout"
  AddCheck "會員 API" (Test-Path (Join-Path $Project "app\api\member")) "app/api/member"
  AddCheck "LINE 登入" (Test-Path (Join-Path $Project "app\api\auth\line")) "app/api/auth/line"
  AddCheck "7-ELEVEN 資料" ((Get-ChildItem $Project -Filter "*711*.json" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1) -ne $null) "門市資料"

  $ok = @($checks | Where-Object {$_.Ok}).Count
  $score = [math]::Round(($ok / [math]::Max($checks.Count,1))*100)

  if (-not $Quiet) {
    Write-Host ""
    foreach ($c in $checks) {
      if ($c.Ok) { Write-Host ("[OK]   {0} - {1}" -f $c.Name,$c.Detail) -ForegroundColor Green }
      else { Write-Host ("[缺少] {0} - {1}" -f $c.Name,$c.Detail) -ForegroundColor Yellow }
    }
    Write-Host ""
    Write-Host "健康分數：$score / 100" -ForegroundColor Cyan
  }

  return [pscustomobject]@{Score=$score;Checks=$checks}
}

function Get-EnvMap($Project) {
  $map = @{}
  $path = Join-Path $Project ".env.local"
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#][A-Za-z0-9_]+)\s*=(.*)$') {
      $map[$matches[1]] = $matches[2].Trim()
    }
  }
  return $map
}

function Mask($Value) {
  if ([string]::IsNullOrEmpty($Value)) { return "未設定" }
  if ($Value.Length -le 4) { return "已設定（隱藏）" }
  return "已設定（隱藏）"
}

function Do-Update($PreviewOnly) {
  $project = Get-Project
  $zip = Pick-Zip
  if (-not $zip) { Write-Host "已取消。"; return }

  if (-not (Test-Path $zip)) { throw "ZIP 不存在：$zip" }

  $temp = Join-Path $env:TEMP ("kdcoffee_zip_" + (Timestamp))
  Expand-ZipManual $zip $temp
  $source = Find-SourceRoot $temp
  $type = Detect-PackageType $source $zip
  $manifest = Get-Manifest $source
  Test-Compatibility $project $manifest | Out-Null
  $summary = Get-ChangeSummary $source $project

  Write-Host ""
  Write-Host "更新包：$([System.IO.Path]::GetFileName($zip))" -ForegroundColor Cyan
  Write-Host "類型：$type"
  if ($manifest) {
    Write-Host "版本：$($manifest.version)"
    Write-Host "最低基底：$($manifest.minimumBaseVersion)"
  }
  Write-Host "新增：$($summary.Added.Count)"
  Write-Host "修改：$($summary.Modified.Count)"
  Write-Host "不變：$($summary.Same)"
  Write-Host "保護：.env.local、node_modules、data、public、ngrok.exe"
  Write-Host ""

  $report = Join-Path $UpdateReports ("update_{0}.txt" -f (Timestamp))
  @(
    "KD Coffee Launcher v$Version"
    "ZIP=$zip"
    "Type=$type"
    "Project=$project"
    "Added=$($summary.Added.Count)"
    ($summary.Added | ForEach-Object {"+ $_"})
    "Modified=$($summary.Modified.Count)"
    ($summary.Modified | ForEach-Object {"* $_"})
  ) | Set-Content $report -Encoding UTF8
  Write-Host "報告：$report"

  if ($PreviewOnly) {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "預覽完成，沒有修改任何檔案。" -ForegroundColor Green
    return
  }

  $confirm = Read-Host "確定更新？請輸入 Y"
  if ($confirm -notmatch '^[Yy]$') {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "已取消。"
    return
  }

  $rollback = $null
  if ($type -eq "PATCH") {
    $rollback = New-PatchRollback $project $summary
    Write-Host "已暫存本次修改檔案（更新成功後自動刪除）。" -ForegroundColor DarkGray
  } else {
    Write-Host "注意：FULL 更新不會自動建立完整備份。重要更新請先從主選單執行手動備份。" -ForegroundColor Yellow
    $fullConfirm = Read-Host "要繼續 FULL 更新，請輸入 FULL"
    if ($fullConfirm -cne "FULL") {
      Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "已取消。"
      return
    }
  }

  try {
    if ($type -eq "FULL") { Apply-Full $source $project } else { Apply-Patch $source $project }
    $next = Join-Path $project ".next"
    if (Test-Path $next) { Remove-Item $next -Recurse -Force }

    $health = Invoke-HealthCheck $project -Quiet
    if ($health.Score -lt 60) { throw "更新後健康檢查分數過低：$($health.Score)" }

    Remove-Item $rollback -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "更新完成，健康分數：$($health.Score)" -ForegroundColor Green
  }
  catch {
    Write-Host "更新失敗。" -ForegroundColor Red
    $rollbackStatus = "not_available"
    if ($type -eq "PATCH" -and $rollback -and (Test-Path $rollback)) {
      Write-Host "正在還原本次修改檔案……" -ForegroundColor Yellow
      Restore-PatchRollback $project $rollback
      $rollbackStatus = "patch_files_restored"
      Write-Host "已還原本次 PATCH 修改。" -ForegroundColor Yellow
    } else {
      Write-Host "FULL 更新未建立自動完整備份，請使用手動備份還原。" -ForegroundColor Yellow
    }
    $errReport = Write-Report "Update" "FAILED" @(
      "Update failed"
      "Project=$project"
      "ZIP=$zip"
      "Error=$($_.Exception.Message)"
      "Rollback=$rollbackStatus"
    )
    Remove-Item $rollback -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "錯誤報告：$errReport"
  }
}

switch ($Mode) {
  "EnsureConfig" {
    Ensure-Config | Out-Null
  }

  "Banner" {
    $c = Ensure-Config
    $p = $c.projectDir
    $pkg = Read-PackageVersion $p
    $title = Read-ProjectTitle $p
    Write-Output "=============================================================="
    Write-Output "KD Coffee Launcher v$Version Ultimate"
    Write-Output "=============================================================="
    Write-Output "目前模式：$($c.mode)"
    Write-Output "目前專案：$p"
    Write-Output "專案名稱：$title"
    Write-Output "Package Version：$pkg"
    Write-Output "=============================================================="
  }

  "StartSite" {
    $p = Get-Project
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "找不到 npm，請先安裝 Node.js。" }
    if (-not (Test-Path (Join-Path $p "node_modules"))) {
      Write-Host "尚未安裝 node_modules，請先執行功能 7：npm install。" -ForegroundColor Yellow
      return
    }
    Start-Process cmd.exe -ArgumentList "/k","cd /d `"$p`" && npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
    Write-Host "網站已啟動。" -ForegroundColor Green
  }

  "UpdateZip" { Do-Update $false }
  "PreviewZip" { Do-Update $true }

  "Backup" {
    $p = Get-Project
    $b = New-Backup $p "manual"
    Write-Host "備份完成：$b" -ForegroundColor Green
  }

  "Restore" {
    $p = Get-Project
    $list = @(Get-ChildItem $Backups -Directory | Sort-Object Name -Descending)
    if ($list.Count -eq 0) { Write-Host "沒有備份。"; return }
    for ($i=0; $i -lt $list.Count; $i++) { Write-Host "[$($i+1)] $($list[$i].Name)" }
    $raw = Read-Host "請輸入備份編號"
    $n = 0
    if (-not [int]::TryParse($raw,[ref]$n)) { throw "輸入錯誤。" }
    $n--
    if ($n -lt 0 -or $n -ge $list.Count) { throw "編號超出範圍。" }
    $sel = $list[$n].FullName

    Get-ChildItem $p -Force | Where-Object {
      $_.Name -notin @("node_modules",".env.local","data","public","ngrok.exe")
    } | Remove-Item -Recurse -Force
    Copy-TreeMerge $sel $p
    if (Test-Path (Join-Path $p ".next")) { Remove-Item (Join-Path $p ".next") -Recurse -Force }
    Write-Host "還原完成：$sel" -ForegroundColor Green
  }

  "Update711" {
    $p = Get-Project
    if (Test-Path (Join-Path $p "update-711-stores.cmd")) {
      Start-Process cmd.exe -ArgumentList "/k","cd /d `"$p`" && update-711-stores.cmd"
    } else {
      Start-Process cmd.exe -ArgumentList "/k","cd /d `"$p`" && npm run update:711"
    }
    Write-Host "已啟動 7-ELEVEN 更新程序。"
  }

  "NpmInstall" {
    $p = Get-Project
    Start-Process cmd.exe -Wait -ArgumentList "/c","cd /d `"$p`" && npm install"
  }

  "NpmUpdate" {
    $p = Get-Project
    Start-Process cmd.exe -Wait -ArgumentList "/c","cd /d `"$p`" && npm update"
  }

  "ClearNext" {
    $p = Get-Project
    $next = Join-Path $p ".next"
    if (Test-Path $next) { Remove-Item $next -Recurse -Force }
    Write-Host ".next 已清除。" -ForegroundColor Green
  }

  "RebuildModules" {
    $p = Get-Project
    $confirm = Read-Host "這會刪除 node_modules 並重新安裝，輸入 Y 繼續"
    if ($confirm -notmatch '^[Yy]$') { return }
    $nm = Join-Path $p "node_modules"
    if (Test-Path $nm) { Remove-Item $nm -Recurse -Force }
    Start-Process cmd.exe -Wait -ArgumentList "/c","cd /d `"$p`" && npm install"
  }

  "StartNgrok" {
    $p = Get-Project
    $ngrok = Resolve-NgrokCommand $p
    if (-not $ngrok) { throw "找不到 ngrok.cmd / ngrok.exe。請先安裝 ngrok，或把 ngrok.exe 放在專案或 Launcher 資料夾。" }
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
    Start-Process cmd.exe -ArgumentList "/k","`"$ngrok`" http 3000" -WindowStyle Normal
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:4040"
    Write-Host "ngrok 已啟動；不會再呼叫 PowerShell 的 ngrok.ps1。" -ForegroundColor Green
  }

  "StartMobileTest" {
    $p = Get-Project
    if (-not (Test-Path (Join-Path $p "node_modules"))) {
      throw "尚未安裝 node_modules，請先執行功能 7：npm install。"
    }

    if (-not (Test-PortListening 3000)) {
      Start-Process cmd.exe -ArgumentList "/k","cd /d `"$p`" && npm.cmd run dev" -WindowStyle Normal
      Write-Host "正在啟動 Next.js..." -ForegroundColor Cyan
      $ready = $false
      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortListening 3000) { $ready = $true; break }
      }
      if (-not $ready) { throw "Next.js 在等待時間內沒有啟動 Port 3000。請查看網站開發視窗。" }
    } else {
      Write-Host "Port 3000 已有網站執行中，沿用目前 Server。" -ForegroundColor Green
    }

    $ngrok = Resolve-NgrokCommand $p
    if (-not $ngrok) { throw "找不到 ngrok.cmd / ngrok.exe。請先安裝 ngrok。" }
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
    Start-Process cmd.exe -ArgumentList "/k","`"$ngrok`" http 3000" -WindowStyle Normal

    $public = $null
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 1
      try {
        $t = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
        $public = ($t.tunnels | Where-Object {$_.public_url -like "https://*"} | Select-Object -First 1).public_url
        if ($public) { break }
      } catch {}
    }

    if ($public) {
      Write-Host ""
      Write-Host "手機請開：$public" -ForegroundColor Green
      Write-Host "此網址可直接在手機 4G/5G/熱點環境測試。" -ForegroundColor Cyan
      try { Set-Clipboard -Value $public; Write-Host "網址已複製到電腦剪貼簿。" -ForegroundColor DarkGray } catch {}
    } else {
      Write-Host "ngrok 已啟動，但暫時讀不到公開網址；請查看新開的 ngrok 視窗或 Dashboard。" -ForegroundColor Yellow
    }
    Start-Process "http://127.0.0.1:4040"
  }

  "OpenLocal" { Start-Process "http://localhost:3000" }
  "OpenNgrokDashboard" { Start-Process "http://127.0.0.1:4040" }

  "LineCheck" {
    $p = Get-Project
    $env = Get-EnvMap $p
    $site = $env["NEXT_PUBLIC_SITE_URL"]
    $id = $env["LINE_LOGIN_CHANNEL_ID"]
    $secret = $env["LINE_LOGIN_CHANNEL_SECRET"]
    Write-Host "NEXT_PUBLIC_SITE_URL：$site"
    Write-Host "LINE_LOGIN_CHANNEL_ID：$(if($id){$id}else{'未設定'})"
    Write-Host "LINE_LOGIN_CHANNEL_SECRET：$(Mask $secret)"
    if ($site) { Write-Host "預期 Callback：$($site.TrimEnd('/'))/api/auth/line/callback" -ForegroundColor Cyan }

    try {
      $t = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
      $public = ($t.tunnels | Where-Object {$_.public_url -like "https://*"} | Select-Object -First 1).public_url
      if ($public) {
        Write-Host "目前 ngrok：$public"
        if ($site -ne $public) {
          Write-Host "警告：.env.local 與目前 ngrok 網址不同。" -ForegroundColor Yellow
          Write-Host "LINE Callback 應登記：$public/api/auth/line/callback"
        }
      }
    } catch {
      Write-Host "ngrok Dashboard 未啟動，略過公開網址檢查。" -ForegroundColor DarkGray
    }

    $report = Write-Report "LINE" "diagnosis" @(
      "NEXT_PUBLIC_SITE_URL=$site"
      "LINE_LOGIN_CHANNEL_ID=$(if($id){'SET'}else{'MISSING'})"
      "LINE_LOGIN_CHANNEL_SECRET=$(if($secret){'SET'}else{'MISSING'})"
    )
    Write-Host "診斷報告：$report"
  }

  "EnvCheck" {
    $p = Get-Project
    $items = @(
      @{Name="Node";Cmd="node";Args="--version"},
      @{Name="npm";Cmd="npm";Args="--version"},
      @{Name="Git";Cmd="git";Args="--version"},
      @{Name="ngrok";Cmd=(Resolve-NgrokCommand $p);Args="version"}
    )
    foreach ($i in $items) {
      $cmd = if ($i.Cmd) { Get-Command $i.Cmd -ErrorAction SilentlyContinue } else { $null }
      if ($cmd) {
        try { $v = & $i.Cmd $i.Args 2>$null | Select-Object -First 1 } catch { $v = "已安裝" }
        Write-Host "[OK] $($i.Name)：$v" -ForegroundColor Green
      } else { Write-Host "[缺少] $($i.Name)" -ForegroundColor Yellow }
    }
    Write-Host "PowerShell：$($PSVersionTable.PSVersion)"
    Write-Host "專案：$p"
  }

  "HealthCheck" {
    $p = Get-Project
    $result = Invoke-HealthCheck $p
    $report = Write-Report "HealthCheck" "health" @(
      "Score=$($result.Score)"
      ($result.Checks | ForEach-Object {"$($_.Ok) | $($_.Name) | $($_.Detail)"})
    )
    Write-Host "健康報告：$report"
  }

  "SwitchProject" {
    $project = Pick-Folder
    if (-not $project) { return }
    if (-not (Test-Path (Join-Path $project "package.json"))) { throw "找不到 package.json。" }
    $c = Ensure-Config
    $c.projectDir = $project
    $c.lastUpdated = (Get-Date).ToString("s")
    Save-Json $ConfigPath $c
    Write-Host "已切換專案：$project" -ForegroundColor Green
  }

  "OpenProject" { Start-Process (Get-Project) }

  "OpenEditor" {
    $p = Get-Project
    if (Get-Command cursor -ErrorAction SilentlyContinue) { Start-Process cursor -ArgumentList "`"$p`"" }
    elseif (Get-Command code -ErrorAction SilentlyContinue) { Start-Process code -ArgumentList "`"$p`"" }
    else { Write-Host "找不到 Cursor 或 VS Code 指令。"; Start-Process $p }
  }

  "DiagnosticPack" {
    $p = Get-Project
    $stamp = Timestamp
    $temp = Join-Path $env:TEMP ("kd_diag_" + $stamp)
    New-Item -ItemType Directory -Force -Path $temp | Out-Null

    $pkg = Join-Path $p "package.json"
    if (Test-Path $pkg) { Copy-Item $pkg $temp }
    $ver = Join-Path $p "VERSION.md"
    if (Test-Path $ver) { Copy-Item $ver $temp }

    $env = Get-EnvMap $p
    @(
      "Project=$p"
      "PackageVersion=$(Read-PackageVersion $p)"
      "NEXT_PUBLIC_SITE_URL=$($env['NEXT_PUBLIC_SITE_URL'])"
      "LINE_LOGIN_CHANNEL_ID=$(if($env['LINE_LOGIN_CHANNEL_ID']){'SET'}else{'MISSING'})"
      "LINE_LOGIN_CHANNEL_SECRET=$(if($env['LINE_LOGIN_CHANNEL_SECRET']){'SET'}else{'MISSING'})"
      "ADMIN_PASSWORD=$(if($env['ADMIN_PASSWORD']){'SET'}else{'MISSING'})"
      "AUTH_SESSION_SECRET=$(if($env['AUTH_SESSION_SECRET']){'SET'}else{'MISSING'})"
    ) | Set-Content (Join-Path $temp "environment_redacted.txt") -Encoding UTF8

    Get-ChildItem $p -Force | Select-Object Name,Length,LastWriteTime |
      Format-Table -AutoSize | Out-String | Set-Content (Join-Path $temp "root_files.txt") -Encoding UTF8

    $health = Invoke-HealthCheck $p -Quiet
    @(
      "Score=$($health.Score)"
      ($health.Checks | ForEach-Object {"$($_.Ok) | $($_.Name) | $($_.Detail)"})
    ) | Set-Content (Join-Path $temp "health.txt") -Encoding UTF8

    $out = Join-Path $Root ("KD_Coffee_Diagnostic_{0}.zip" -f $stamp)
    Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $out -Force
    Remove-Item $temp -Recurse -Force
    Write-Host "診斷包已建立：$out" -ForegroundColor Green
  }

  "StopDev" {
    $confirm = Read-Host "這會關閉 node.exe 與 ngrok.exe，輸入 Y 繼續"
    if ($confirm -notmatch '^[Yy]$') { return }
    Get-Process node,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "已關閉 Node 與 ngrok 程序。" -ForegroundColor Green
  }
}
