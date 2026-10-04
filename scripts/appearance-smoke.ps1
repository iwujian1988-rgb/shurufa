$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$adb = Join-Path $projectRoot '.tools/android-sdk/platform-tools/adb.exe'
function Read-Ui {
    & $adb -s emulator-5554 shell uiautomator dump /sdcard/appearance.xml | Out-Null
    & $adb -s emulator-5554 pull /sdcard/appearance.xml .cache/appearance.xml 2>$null | Out-Null
    return [xml](Get-Content .cache/appearance.xml -Raw)
}
function Tap-Text([string]$value) {
    $node = (Read-Ui).SelectNodes('//node') | Where-Object { $_.text -eq $value } | Select-Object -First 1
    if (!$node) { throw "Control not visible: $value" }
    $bounds = [regex]::Matches($node.bounds, '\d+') | ForEach-Object { [int]$_.Value }
    & $adb -s emulator-5554 shell input tap ([int](($bounds[0]+$bounds[2])/2)) ([int](($bounds[1]+$bounds[3])/2))
}
& $adb -s emulator-5554 shell am force-stop dev.ciban.french
& $adb -s emulator-5554 shell ime enable dev.ciban.french/dev.ciban.ime.CibanIme | Out-Null
& $adb -s emulator-5554 shell ime set dev.ciban.french/dev.ciban.ime.CibanIme | Out-Null
& $adb -s emulator-5554 shell am start -n dev.ciban.french/dev.ciban.ime.MainActivity | Out-Null
Read-Ui | Out-Null
& $adb -s emulator-5554 shell input swipe 400 920 400 250 500
Tap-Text '外观'
Tap-Text '深色'
Read-Ui | Out-Null
foreach ($letter in 'kafei'.ToCharArray()) { Tap-Text ([string]$letter) }
node -e "const fs=require('fs'),cp=require('child_process');fs.writeFileSync('deliverables/french-dark-candidates.png',cp.execFileSync('.tools/android-sdk/platform-tools/adb.exe',['-s','emulator-5554','exec-out','screencap','-p']));"
& $adb -s emulator-5554 shell input swipe 400 920 400 250 500
Tap-Text '系统键盘测试'
Read-Ui | Out-Null
$selectedIme = & $adb -s emulator-5554 shell settings get secure default_input_method
if ($selectedIme.Trim() -ne 'dev.ciban.french/dev.ciban.ime.CibanIme') { throw "Wrong active IME: $selectedIme" }
node -e "const fs=require('fs'),cp=require('child_process');fs.writeFileSync('deliverables/french-dark-system.png',cp.execFileSync('.tools/android-sdk/platform-tools/adb.exe',['-s','emulator-5554','exec-out','screencap','-p']));"
Write-Output '主题 UI 操作完成，真实截图待视觉检查。'
