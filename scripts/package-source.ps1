$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sources = @(
    'README.md','AGENTS.md','LICENSE','upstream-lock.json','SOURCE_CONTENTS.md',
    'docs','data','scripts','mobile','upstream','.cache/source-vendor','.cache/runtime-data',
    'deliverables/测试说明.md','deliverables/验收记录.md','deliverables/手机安装记录.md',
    'deliverables/九宫格验收记录.md','deliverables/法语词库验收记录.md',
    'deliverables/t9-phone-ui-results.json','deliverables/french-phone-ui-results.json',
    'deliverables/0.4-emulator-english-jni.txt','deliverables/0.4-emulator-french-jni.txt',
    'deliverables/data-upgrade-initial.json','deliverables/data-upgrade-verification.json',
    'deliverables/data-coverage.json','deliverables/french-data-coverage.json',
    'deliverables/英语与键盘高度验收记录.md','deliverables/english-phone-ui-results.json',
    'deliverables/height-phone-ui-results.json','deliverables/layout-emulator-ui-results.json',
    'deliverables/english-data-coverage.json',
    'deliverables/0.4-english-signature.txt','deliverables/0.4-french-signature.txt',
    'deliverables/phone-handoff.json','deliverables/0.4-phone-ready.png',
    'deliverables/english-phone-yinhang-detail.png','deliverables/english-phone-haizi-detail.png',
    'deliverables/layout-emulator-landscape.png','deliverables/layout-emulator-reduced-width.png',
    'deliverables/english-t9-lesson.json',
    'deliverables/九宫格字母与性能验收记录.md',
    'deliverables/0.5-performance-english-baseline.json','deliverables/0.5-baseline-provenance.json',
    'deliverables/0.5-performance-english-optimized.json','deliverables/0.5-performance-french-optimized.json',
    'deliverables/0.5-letters-phone-results.json','deliverables/0.5-t9-ranking.txt',
    'deliverables/0.5-emulator-english-jni.txt','deliverables/0.5-emulator-french-jni.txt',
    'deliverables/0.5-english-signature.txt','deliverables/0.5-french-signature.txt',
    'deliverables/0.5-phone-ready.png','deliverables/0.5-english-letters.png','deliverables/0.5-french-letters.png',
    'deliverables/0.5-english-detail.png','deliverables/0.5-french-detail.png'
)
$excludes = @(
    '.git','*.keystore','*.apk','upstream/target','mobile/native/target','mobile/android/.gradle',
    'mobile/android/.kotlin','mobile/android/app/build','mobile/android/local.properties',
    'mobile/android/app/src/main/jniLibs','mobile/android/app/src/main/assets/data',
    'mobile/android/app/src/english/assets/data','mobile/android/app/src/french/assets/data'
) | ForEach-Object { "--exclude=$_" }
Push-Location $projectRoot
try {
    & tar -czf deliverables/ciban-demo-source.tar.gz @excludes @sources
    if ($LASTEXITCODE) { throw 'Source archive failed' }
} finally { Pop-Location }
