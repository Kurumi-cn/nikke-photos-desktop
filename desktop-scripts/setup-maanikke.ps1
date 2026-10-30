$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$cacheRoot=Join-Path (Split-Path $projectRoot -Parent) 'codex temp\nikke-desktop\automation-dev-copy'
$runtime=Join-Path $cacheRoot 'runtime'
$previousTemp=$env:TEMP; $previousTmp=$env:TMP
try {
    $env:TEMP=Join-Path $cacheRoot 'temp'; $env:TMP=$env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    & python -c "import sys,struct; assert sys.version_info >= (3,12) and struct.calcsize('P') == 8, 'Python 3.12+ x64 required by this lock'"
    if($LASTEXITCODE -ne 0){throw 'This dependency lock requires Python 3.12+ x64'}
    & python -m venv $runtime
    if($LASTEXITCODE -ne 0){throw 'Cannot create isolated Python environment'}
    $runtimePython=Join-Path $runtime 'Scripts\python.exe'
    & $runtimePython -m pip install --disable-pip-version-check --cache-dir (Join-Path $cacheRoot 'pip') -r (Join-Path $projectRoot 'automation\maanikke\requirements.txt')
    if($LASTEXITCODE -ne 0){throw 'Pinned dependency installation failed'}
    & $runtimePython -m pip check
    if($LASTEXITCODE -ne 0){throw 'Dependency consistency check failed'}
} finally { $env:TEMP=$previousTemp; $env:TMP=$previousTmp }
