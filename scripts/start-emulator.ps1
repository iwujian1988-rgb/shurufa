$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sdk = Join-Path $projectRoot '.tools/android-sdk'
if (!(Test-Path (Join-Path $sdk 'platform-tools'))) {
    Copy-Item -LiteralPath 'C:\Users\imwuj\AppData\Local\Android\Sdk\platform-tools' -Destination $sdk -Recurse
}
New-Item -ItemType Directory -Force (Join-Path $sdk 'platforms') | Out-Null
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_AVD_HOME = Join-Path $projectRoot '.tools/avd'
$avd = Join-Path $env:ANDROID_AVD_HOME 'CibanDemo.avd'
New-Item -ItemType Directory -Force $avd | Out-Null
Set-Content -LiteralPath (Join-Path $env:ANDROID_AVD_HOME 'CibanDemo.ini') -Encoding ascii -Value @"
avd.ini.encoding=UTF-8
path=$avd
target=android-35
"@
Set-Content -LiteralPath (Join-Path $avd 'config.ini') -Encoding ascii -Value @"
AvdId=CibanDemo
avd.ini.encoding=UTF-8
abi.type=x86_64
hw.cpu.arch=x86_64
hw.cpu.ncore=4
hw.ramSize=2048
hw.lcd.width=1080
hw.lcd.height=1920
hw.lcd.density=420
hw.keyboard=yes
hw.mainKeys=no
hw.gpu.enabled=yes
hw.gpu.mode=software
hw.audioInput=no
hw.audioOutput=no
image.sysdir.1=$sdk\system-images\android-35\aosp_atd\x86_64\
tag.id=aosp_atd
tag.display=AOSP ATD
disk.dataPartition.size=2G
fastboot.forceColdBoot=yes
"@
$logs = Join-Path $projectRoot '.cache'
Start-Process -FilePath (Join-Path $sdk 'emulator/emulator.exe') -ArgumentList @('-avd','CibanDemo','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-port','5554') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'emulator.log') -RedirectStandardError (Join-Path $logs 'emulator-error.log')
