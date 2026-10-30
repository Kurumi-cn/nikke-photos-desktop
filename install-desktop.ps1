$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$cacheRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'codex temp/nikke-desktop'
New-Item -ItemType Directory -Force -Path (Join-Path $cacheRoot 'temp') | Out-Null
$env:ELECTRON_CACHE = Join-Path $cacheRoot 'electron'
$env:ELECTRON_BUILDER_CACHE = Join-Path $cacheRoot 'electron-builder'
$env:TEMP = $env:TMP = Join-Path $cacheRoot 'temp'
$env:electron_config_cache = $env:ELECTRON_CACHE
npm install --offline=false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node node_modules/electron/install.js
exit $LASTEXITCODE
