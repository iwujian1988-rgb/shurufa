param(
    [switch]$SkipNative,
    [string]$AndroidSdk = $env:ANDROID_HOME,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$NdkVersion = '28.2.13676358',
    [string]$DebugKeystore = $env:CIBAN_DEBUG_KEYSTORE
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'rust-env.ps1')
if (!$AndroidSdk) { $AndroidSdk = $env:ANDROID_SDK_ROOT }
if (!$AndroidSdk) { $AndroidSdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (!$JavaHome -and (Test-Path 'C:\Program Files\Java\jdk-23')) { $JavaHome = 'C:\Program Files\Java\jdk-23' }
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Set JAVA_HOME or pass -JavaHome with a compatible JDK installation.' }
$androidSdk = (Resolve-Path -LiteralPath $AndroidSdk).Path
$ndkBin = Join-Path $androidSdk "ndk/$NdkVersion/toolchains/llvm/prebuilt/windows-x86_64/bin"
if (!(Test-Path (Join-Path $ndkBin 'aarch64-linux-android26-clang.cmd'))) { throw "Install Android NDK $NdkVersion in $androidSdk" }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $androidSdk
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.cache/gradle'
$nativeRoot = Join-Path $projectRoot 'mobile/native'
foreach ($name in @('dict.qj','lm.qj','glossary-en.qj','english.tsv')) {
    if (!(Test-Path (Join-Path $projectRoot ".cache/runtime-data/data/generated/$name"))) {
        throw 'Runtime data is missing. Run scripts/prepare-runtime-data.ps1 first.'
    }
}
& node (Join-Path $projectRoot 'scripts/build-french-data.cjs')
if ($LASTEXITCODE) { throw 'French data build failed' }
& node (Join-Path $projectRoot 'scripts/build-english-data.cjs')
if ($LASTEXITCODE) { throw 'English data build failed' }
$androidRoot = Join-Path $projectRoot 'mobile/android'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = Join-Path $ndkBin 'aarch64-linux-android26-clang.cmd'
$env:CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER = Join-Path $ndkBin 'x86_64-linux-android26-clang.cmd'
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = '-C link-arg=-Wl,-z,max-page-size=16384'
$env:CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS = '-C link-arg=-Wl,-z,max-page-size=16384'
Push-Location $nativeRoot
try {
    cargo test --locked
    if ($LASTEXITCODE) { throw 'Rust tests failed' }
    cargo run --locked --bin pack-assets -- $projectRoot
    if ($LASTEXITCODE) { throw 'Asset packing failed' }
    & node (Join-Path $projectRoot 'scripts/stamp-data-assets.cjs')
    if ($LASTEXITCODE) { throw 'Data asset versioning failed' }
    if (!$SkipNative) {
        foreach ($target in @(@('aarch64-linux-android','arm64-v8a'),@('x86_64-linux-android','x86_64'))) {
            cargo build --locked --release --target $target[0] --lib
            if ($LASTEXITCODE) { throw "Rust build failed: $($target[0])" }
            $destination = Join-Path $androidRoot "app/src/main/jniLibs/$($target[1])"
            New-Item -ItemType Directory -Force $destination | Out-Null
            Copy-Item -LiteralPath "target/$($target[0])/release/ciban_native.dll" -Destination $destination -ErrorAction SilentlyContinue
            Copy-Item -LiteralPath "target/$($target[0])/release/libciban_native.so" -Destination $destination
        }
    }
} finally { Pop-Location }
$sdkProperty = $androidSdk.Replace('\','/').Replace(':','\:')
Set-Content -LiteralPath (Join-Path $androidRoot 'local.properties') -Value "sdk.dir=$sdkProperty" -Encoding ascii
Push-Location $androidRoot
try {
    $gradleArgs = @('assembleEnglishDebug','assembleFrenchDebug','assembleEnglishDebugAndroidTest','assembleFrenchDebugAndroidTest','lintEnglishDebug','lintFrenchDebug','-Pkotlin.compiler.execution.strategy=in-process')
    if (!$DebugKeystore) {
        $existingDebugKey = Join-Path $env:USERPROFILE '.android/debug.keystore'
        if (Test-Path -LiteralPath $existingDebugKey) { $DebugKeystore = $existingDebugKey }
    }
    if ($DebugKeystore) {
        $keyPath = (Resolve-Path -LiteralPath $DebugKeystore).Path.Replace('\','/')
        $gradleArgs += "-PcibanDebugKeystore=$keyPath"
    }
    & ./gradlew.bat @gradleArgs
    if ($LASTEXITCODE) { throw 'Android build or lint failed' }
} finally { Pop-Location }
$deliverables = Join-Path $projectRoot 'deliverables'
New-Item -ItemType Directory -Force $deliverables | Out-Null
Copy-Item -LiteralPath (Join-Path $androidRoot 'app/build/outputs/apk/english/debug/app-english-debug.apk') -Destination (Join-Path $deliverables 'ciban-english-demo.apk')
Copy-Item -LiteralPath (Join-Path $androidRoot 'app/build/outputs/apk/french/debug/app-french-debug.apk') -Destination (Join-Path $deliverables 'ciban-french-demo.apk')
Get-FileHash (Join-Path $deliverables '*.apk') -Algorithm SHA256 | Format-List
