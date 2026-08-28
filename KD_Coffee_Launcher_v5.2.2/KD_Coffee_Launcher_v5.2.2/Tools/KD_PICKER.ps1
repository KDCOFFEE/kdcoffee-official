param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("Folder","Zip")]
  [string]$Mode
)

Add-Type -AssemblyName System.Windows.Forms

if ($Mode -eq "Folder") {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "請選擇 KD Coffee 網站專案資料夾（最外層必須有 package.json）"
  $d.ShowNewFolderButton = $false
  if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $d.SelectedPath
  }
  exit
}

$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = "請選擇 KD Coffee FULL 或 PATCH ZIP"
$d.Filter = "ZIP files (*.zip)|*.zip"
$d.Multiselect = $false
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $d.FileName
}
