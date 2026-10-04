$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$env:RUSTUP_TOOLCHAIN) { $env:RUSTUP_TOOLCHAIN = 'stable' }
$env:CARGO_HOME = Join-Path $projectRoot '.cache/cargo'
$rustup = Join-Path $env:USERPROFILE '.cargo/bin/rustup.exe'
if (!(Test-Path -LiteralPath $rustup)) { $rustup = (Get-Command rustup -ErrorAction Stop).Source }
$toolchainRoot = & $rustup which --toolchain $env:RUSTUP_TOOLCHAIN rustc
if ($LASTEXITCODE) { throw 'Install the selected Rust toolchain with rustup first.' }
$env:Path = "$(Split-Path $toolchainRoot -Parent);$env:Path"

# Developer PowerShell already supplies LIB; otherwise locate installed build tools.
if (!$env:LIB) {
    $msvcRoot = $env:CIBAN_MSVC_ROOT
    if (!$msvcRoot) {
        $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
        if (!(Test-Path -LiteralPath $vswhere)) { throw 'Install Visual Studio C++ Build Tools or set CIBAN_MSVC_ROOT.' }
        $vsRoot = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if (!$vsRoot) { throw 'Visual Studio C++ x64 build tools were not found.' }
        $version = Get-Content (Join-Path $vsRoot 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt') -Raw
        $msvcRoot = Join-Path $vsRoot "VC/Tools/MSVC/$($version.Trim())"
    }
    $sdkRoot = $env:CIBAN_WINDOWS_SDK_LIB
    if (!$sdkRoot) {
        $kitsLib = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/Lib'
        if (Test-Path -LiteralPath $kitsLib) {
            $sdk = Get-ChildItem -LiteralPath $kitsLib -Directory | Where-Object {
                (Test-Path (Join-Path $_.FullName 'um/x64/kernel32.lib')) -and
                (Test-Path (Join-Path $_.FullName 'ucrt/x64/ucrt.lib'))
            } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
            if ($sdk) { $sdkRoot = $sdk.FullName }
        }
        if (!$sdkRoot -and (Test-Path (Join-Path $projectRoot '.tools/windows-sdk-x64/c/um/x64/kernel32.lib'))) {
            $sdkRoot = Join-Path $projectRoot '.tools/windows-sdk-x64/c'
        }
    }
    if (!$sdkRoot) { throw 'Install Windows SDK or set CIBAN_WINDOWS_SDK_LIB to its Lib/<version> directory.' }
    $env:Path = "$(Join-Path $msvcRoot 'bin/Hostx64/x64');$env:Path"
    $env:LIB = "$(Join-Path $msvcRoot 'lib/x64');$(Join-Path $sdkRoot 'um/x64');$(Join-Path $sdkRoot 'ucrt/x64')"
}
