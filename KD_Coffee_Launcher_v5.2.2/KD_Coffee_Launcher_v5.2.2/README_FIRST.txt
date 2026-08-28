KD Coffee Launcher v5.1.2 Ultimate Fix

這次修正的真正原因
==================

v5.1.1 的 BAT 將 %~dp0 傳給 PowerShell。
由於 %~dp0 本身以反斜線結尾，在部分 Windows 參數解析情況下，
尾端引號會混入路徑，造成：

New-Item：路徑中有不合法的字元

v5.1.2 的修正
==============

1. BAT 不再傳入任何資料夾路徑。
2. PowerShell 使用 $PSScriptRoot 自動找到 Tools 資料夾。
3. 再由 Tools 的上一層取得 Launcher 根目錄。
4. 建立資料夾改用 Directory.CreateDirectory。
5. 檔案操作優先使用 LiteralPath。
6. 主 BAT 仍維持純 ASCII。

請使用
======

KD_COFFEE_LAUNCHER_v5_1_2.bat

請勿再使用舊的 v5.1 或 v5.1.1 BAT。

第一次啟動後
============

選擇最外層有 package.json 的網站專案。

若 v13 顯示找不到 next，請先選：

7. npm install

完成後再選：

1. 啟動網站
