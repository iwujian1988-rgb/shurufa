param(
    [ValidateSet('english','french','both')][string]$Product = 'both',
    [string]$Version = '0.1.0-demo.1',
    [string]$InnoCompiler
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'rust-env.ps1')
$upstream = Join-Path $projectRoot 'upstream'
$products = Get-Content (Join-Path $projectRoot 'products/windows.json') -Raw | ConvertFrom-Json
if (!$InnoCompiler) { $InnoCompiler = Join-Path $projectRoot '.tools/inno/ISCC.exe' }
if (!(Test-Path -LiteralPath $InnoCompiler)) { throw 'Set -InnoCompiler to an installed official Inno Setup 7 ISCC.exe.' }
$output = Join-Path $projectRoot 'deliverables'
$stagingRoot = Join-Path $output 'windows-staging'
New-Item -ItemType Directory -Force $stagingRoot | Out-Null
$packRoot = Join-Path $projectRoot '.cache/windows-data'
& cargo run --locked --manifest-path (Join-Path $projectRoot 'mobile/native/Cargo.toml') --bin pack-assets -- $projectRoot $packRoot
if ($LASTEXITCODE) { throw 'Shared data packing failed' }
$x64Lib = $env:LIB
$x64Path = $env:Path
$msvcLib = ($x64Lib -split ';' | Where-Object { $_ -match 'MSVC.+lib[/\\]x64$' } | Select-Object -First 1)
if (!$msvcLib) { throw 'Start with the project rust-env.ps1 or MSVC Developer PowerShell' }
$x86Lib = (Split-Path $msvcLib -Parent) + '/x86'
$sdk86 = Join-Path $projectRoot '.tools/windows-sdk-x86/c'
if (!(Test-Path (Join-Path $sdk86 'um/x86/kernel32.lib'))) { throw 'Restore the pinned x86 SDK libs; see desktop/windows/BUILD.md' }
$selected = if ($Product -eq 'both') { @('english','french') } else { @($Product) }
Push-Location $upstream
try {
    foreach ($id in $selected) {
        $config = $products.$id
        $env:CIBAN_PRODUCT = $id
        $env:CIBAN_VERSION = $Version
        $env:QINGJIAN_UIACCESS = '0'
        $env:LIB = $x64Lib; $env:Path = $x64Path
        & cargo build --locked --release -p qingjian-windows-server -p qingjian-windows-tsf -p qingjian-windows-settings
        if ($LASTEXITCODE) { throw "x64 build failed: $id" }
        $stage = Join-Path $stagingRoot "$id-$Version"
        # Only this named product's generated staging tree is replaced.
        $resolved = [System.IO.Path]::GetFullPath($stage)
        $allowed = [System.IO.Path]::GetFullPath($stagingRoot) + [System.IO.Path]::DirectorySeparatorChar
        if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe stage path' }
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
        foreach ($dir in @($stage,(Join-Path $stage 'runtime'),(Join-Path $stage 'data/generated'),(Join-Path $stage 'assets'))) { New-Item -ItemType Directory -Force $dir | Out-Null }
        Copy-Item -LiteralPath 'target/release/qingjian-server.exe' -Destination (Join-Path $stage $config.server)
        Copy-Item -LiteralPath 'target/release/qingjian-settings.exe' -Destination (Join-Path $stage $config.settings)
        Copy-Item -LiteralPath 'target/release/qingjian_tsf.dll' -Destination (Join-Path $stage 'tsf-x64.dll')
        foreach ($line in Get-Content 'apps/windows/installer/settings-runtime.txt') {
            $line = $line.Trim(); if (!$line -or $line.StartsWith('#')) { continue }
            $source = Join-Path 'target/release' $line
            if (!(Test-Path -LiteralPath $source)) { throw "Runtime missing: $line" }
            Copy-Item -LiteralPath $source -Destination (Join-Path $stage 'runtime') -Recurse
        }
        # Cargo build scripts are x64 host executables even when the TSF target is x86.
        # Apply x86 LIB only inside the target linker, not to the whole cargo process.
        $targetLinker = Join-Path $projectRoot '.cache/windows-linker-x86.cmd'
        $targetLib = "$x86Lib;$(Join-Path $sdk86 'um/x86');$(Join-Path $sdk86 'ucrt/x86')"
        $nativeLink = (Get-Command link.exe -ErrorAction Stop).Source
        [IO.File]::WriteAllText($targetLinker, "@echo off`r`nset `"LIB=$targetLib`"`r`n`"$nativeLink`" %*`r`n")
        $env:CARGO_TARGET_I686_PC_WINDOWS_MSVC_LINKER = $targetLinker
        & cargo build --locked --release -p qingjian-windows-tsf --target i686-pc-windows-msvc
        if ($LASTEXITCODE) { throw "x86 TSF build failed: $id" }
        Copy-Item -LiteralPath 'target/i686-pc-windows-msvc/release/qingjian_tsf.dll' -Destination (Join-Path $stage 'tsf-x86.dll')
        $env:LIB = $x64Lib; $env:Path = $x64Path
        $data = Join-Path $stage 'data/generated'
        Copy-Item -Path (Join-Path $packRoot 'main/assets/data/*') -Destination $data
        Copy-Item -Path (Join-Path $packRoot "$id/assets/data/*") -Destination $data
        Move-Item -LiteralPath (Join-Path $data 'glossary.qj') -Destination (Join-Path $data "glossary-$($config.language).qj")
        Copy-Item -LiteralPath (Join-Path $packRoot 'main/assets/licenses') -Destination $stage -Recurse
        Copy-Item -Path (Join-Path $projectRoot 'desktop/windows/licenses/*') -Destination (Join-Path $stage 'licenses')
        Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/windows/测试说明.txt') -Destination $stage
        Copy-Item -LiteralPath (Join-Path $projectRoot 'desktop/windows/resources/ciban.ico') -Destination $stage
        Copy-Item -LiteralPath 'assets/emoji' -Destination (Join-Path $stage 'assets') -Recurse
        Copy-Item -LiteralPath 'assets/levels' -Destination (Join-Path $stage 'assets') -Recurse
        Copy-Item -LiteralPath 'assets/sample' -Destination (Join-Path $stage 'assets') -Recurse
        & $InnoCompiler "/DStageRoot=$stage" "/DOutputRoot=$output" "/DProduct=$id" "/DProductName=$($config.name)" "/DProductDirectory=$($config.directory)" "/DProductAppId={$($config.appId)" "/DServerExe=$($config.server)" "/DSettingsExe=$($config.settings)" "/DAppVersion=$Version" (Join-Path $projectRoot 'desktop/windows/installer.iss')
        if ($LASTEXITCODE) { throw "Installer packaging failed: $id" }
        $installer = Join-Path $output "ciban-$id-$Version-windows-x64-setup.exe"
        Get-FileHash -LiteralPath $installer -Algorithm SHA256
    }
} finally {
    Pop-Location
    $env:LIB = $x64Lib; $env:Path = $x64Path
    Remove-Item Env:CIBAN_PRODUCT -ErrorAction SilentlyContinue
    Remove-Item Env:CIBAN_VERSION -ErrorAction SilentlyContinue
    Remove-Item Env:CARGO_TARGET_I686_PC_WINDOWS_MSVC_LINKER -ErrorAction SilentlyContinue
}
