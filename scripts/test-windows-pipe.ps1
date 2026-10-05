param([string]$Version = '0.1.0-demo.2')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$products = Get-Content (Join-Path $projectRoot 'products/windows.json') -Raw | ConvertFrom-Json
$evidence = Join-Path $projectRoot 'deliverables/windows-evidence-v2'
$testBase = Join-Path $projectRoot ".cache/windows-smoke-$Version"
New-Item -ItemType Directory -Force $testBase,$evidence | Out-Null
$originalAppData = $env:APPDATA; $originalLocalAppData = $env:LOCALAPPDATA
$env:APPDATA = Join-Path $testBase 'roaming'; $env:LOCALAPPDATA = Join-Path $testBase 'local'
$servers = @(); $report = @(); $pipes = @{}
try {
    foreach ($id in @('english','french')) {
        $stage = Join-Path $projectRoot "deliverables/windows-staging/$id-$Version"
        $pipes[$id] = "\\.\pipe\ciban-smoke-$id-$([guid]::NewGuid().ToString('N'))"
        $servers += Start-Process -FilePath (Join-Path $stage $products.$id.server) -ArgumentList @('--test-pipe',$pipes[$id]) -WorkingDirectory $stage -WindowStyle Hidden -PassThru
    }
    Start-Sleep -Seconds 2
    foreach ($id in @('english','french')) {
        $stage = Join-Path $projectRoot "deliverables/windows-staging/$id-$Version"
        $server = $servers[(@('english','french').IndexOf($id))]
        if ($server.HasExited) { throw "Staged shipping server exited before smoke: $id" }
        $result = & (Join-Path $projectRoot 'upstream/target/debug/examples/ciban-smoke.exe') $id $stage $products.$id.clsid $evidence $pipes[$id] $server.Id 2>&1
        $result | Set-Content (Join-Path $evidence "$id-pipe.txt") -Encoding utf8
        $result | Write-Output
        if ($LASTEXITCODE) { throw "Real pipe / DLL regression failed: $id" }
        $configPath = Join-Path $env:APPDATA "$($products.$id.directory)/config.toml"
        $configText = Get-Content $configPath -Raw
        if ($configText -notmatch 'input_log = false' -or $configText -notmatch 'check = false') { throw 'Privacy defaults regression' }
        if (Test-Path (Join-Path (Split-Path $configPath -Parent) 'input-log.jsonl')) { throw 'Private tests must not write input log' }
        $report += [ordered]@{
            product=$id; clsid=$products.$id.clsid; profile=$products.$id.profile;
            serverSha256=(Get-FileHash (Join-Path $stage $products.$id.server)).Hash.ToLowerInvariant();
            dll64Sha256=(Get-FileHash (Join-Path $stage 'tsf-x64.dll')).Hash.ToLowerInvariant();
            dll32Sha256=(Get-FileHash (Join-Path $stage 'tsf-x86.dll')).Hash.ToLowerInvariant();
            pipeRoundTrips='passed'; realDllFactory='passed'; privateInputLogAbsent=$true;
            fixture='nihao/pingguo/xiexie/yinhang + French pinggai/pinggu/baoxianmo/chongdianbao; original full meaning equals Ctrl+digit commit; Esc and Chinese space commit';
            systemRegistration='not tested: administrator confirmation required';
            settingsUi='not visually verified: Computer Use app approval timed out';
        }
        & (Join-Path $projectRoot 'upstream/target/debug/examples/ciban-render.exe') (Join-Path $evidence "$id-yinhang-frame.json") (Join-Path $evidence "$id-candidate-render")
        if ($LASTEXITCODE) { throw "Candidate rendering failed: $id" }
        if ($id -eq 'french') {
            & (Join-Path $projectRoot 'upstream/target/debug/examples/ciban-render.exe') (Join-Path $evidence 'french-pinggai-frame.json') (Join-Path $evidence 'french-cap-render')
            if ($LASTEXITCODE) { throw 'Bottle-cap candidate rendering failed' }
        }
    }
    [ordered]@{testedAt=(Get-Date -Format o);version=$Version;products=$report;scope='Real shipping server + Windows named pipes + TSF COM creation. Does not prove installed TSF host typing or settings GUI.'} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $evidence 'verification.json') -Encoding utf8
} finally {
    foreach ($server in $servers) { if (!$server.HasExited) { Stop-Process -Id $server.Id -Force } }
    $env:APPDATA = $originalAppData; $env:LOCALAPPDATA = $originalLocalAppData
}
