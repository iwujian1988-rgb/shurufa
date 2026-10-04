# 恢复锁定的上游运行数据；只解出 Android 构建需要的四个文件。
param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$expected = '42ad08fb2fe9f497c0ab191c120f05386f6adcc9d713c3283200aaed690e62f3'
if (!$ArchivePath) {
    $downloads = Join-Path $projectRoot '.cache/downloads'
    New-Item -ItemType Directory -Force $downloads | Out-Null
    $ArchivePath = Join-Path $downloads 'qingjian-data.tar.gz'
    if (!(Test-Path -LiteralPath $ArchivePath)) {
        $temporary = "$ArchivePath.partial"
        Invoke-WebRequest -Uri 'https://github.com/qingjian-team/qingjian/releases/download/data-v3/qingjian-data.tar.gz' -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
            throw 'Downloaded runtime archive SHA-256 does not match the pinned release.'
        }
        Move-Item -LiteralPath $temporary -Destination $ArchivePath
    }
}
if ((Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Runtime archive SHA-256 does not match the pinned release.'
}
$runtimeRoot = Join-Path $projectRoot '.cache/runtime-data'
New-Item -ItemType Directory -Force $runtimeRoot | Out-Null
$required = @('data/generated/dict.qj','data/generated/lm.qj','data/generated/glossary-en.qj','data/generated/english.tsv')
& tar -xzf $ArchivePath -C $runtimeRoot @required
if ($LASTEXITCODE) { throw 'Runtime data extraction failed.' }
foreach ($file in $required) {
    if (!(Test-Path -LiteralPath (Join-Path $runtimeRoot $file))) { throw "Runtime file is missing: $file" }
}
Write-Output 'Pinned runtime data is ready for Android builds.'
