# Restore official pinned SDK packages into this project's ignored tools directory.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = '10.0.26100.4948'
$packages = @(
    @('buildtools','Microsoft.Windows.SDK.BuildTools','AED41D0C6A3C78B794F972F0218A8A57D8481851C45720BB0A076F32FCFE6A02'),
    @('common','Microsoft.Windows.SDK.CPP','8C17F5BEB7616CBFB665F76F2E1AD74ECEAF7B97C8EF1D0BBC4CA2EB9E525413'),
    @('x64','Microsoft.Windows.SDK.CPP.x64','8150A2F0DC69FD2B2A3AFD6D66B38E3DBAB2B901CC5DC65DE42BE4836C3953F3'),
    @('x86','Microsoft.Windows.SDK.CPP.x86','C1A193F6E0EF197F3083952EE1A07E83510A5F0868FFD2F8EADB1713D25D9001')
)
$downloads = Join-Path $projectRoot '.cache/downloads'
New-Item -ItemType Directory -Force $downloads | Out-Null
foreach ($package in $packages) {
    $archive = Join-Path $downloads "windows-sdk-$($package[0]).zip"
    if (!(Test-Path -LiteralPath $archive)) {
        $id = $package[1].ToLowerInvariant()
        Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/$id/$version/$id.$version.nupkg" -OutFile "$archive.partial"
        if ((Get-FileHash -LiteralPath "$archive.partial").Hash -ne $package[2]) { throw "SDK checksum mismatch: $id" }
        Move-Item -LiteralPath "$archive.partial" -Destination $archive
    }
    if ((Get-FileHash -LiteralPath $archive).Hash -ne $package[2]) { throw "SDK checksum mismatch: $archive" }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $projectRoot ".tools/windows-sdk-$($package[0])") -Force
}
Write-Output 'Pinned Windows SDK headers, tools and x64/x86 libraries are ready.'
