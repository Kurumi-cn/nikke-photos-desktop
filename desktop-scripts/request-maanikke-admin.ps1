param([Parameter(Mandatory=$true)][string]$ProjectRoot,[Parameter(Mandatory=$true)][string]$RequestFile,[string]$CacheRoot)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$projectPath=[IO.Path]::GetFullPath($ProjectRoot)
$requestPath=[IO.Path]::GetFullPath($RequestFile)
$adminRoot=if($CacheRoot){[IO.Path]::GetFullPath((Join-Path $CacheRoot 'admin-nikke'))}else{[IO.Path]::GetFullPath((Join-Path $projectPath '..\codex temp\nikke-desktop\automation-dev-copy\admin-nikke'))}
$runDir=[IO.Path]::GetDirectoryName($requestPath)
if([IO.Path]::GetFileName($requestPath) -ne 'request.json' -or [IO.Path]::GetDirectoryName($runDir) -ne $adminRoot){throw 'Unexpected request path'}
$pythonPath=Join-Path $projectPath 'runtime\python.exe'
if(-not (Test-Path -LiteralPath $pythonPath)){$pythonPath=[IO.Path]::GetFullPath((Join-Path $projectPath '..\codex temp\nikke-desktop\automation-dev-copy\runtime\Scripts\python.exe'))}
$scriptPath=Join-Path $projectPath 'automation\maanikke\admin_once.py'
$requestData=Get-Content -LiteralPath $requestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($requestData.action -eq 'search-mermaid-once'){$scriptPath=Join-Path $projectPath 'automation\maanikke\admin_search_once.py'}
if($requestData.action -eq 'collect-three-once'){$scriptPath=Join-Path $projectPath 'automation\maanikke\admin_collect_three.py'}
try {
    # Human approves UAC. Only the fixed one-shot helper is elevated, with no interactive console.
    $arguments='-I -B -X utf8 "'+$scriptPath+'" "'+$requestPath+'" --request-base "'+$adminRoot+'"'
    $child=Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $projectPath -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    @{started=$true;canceled=$false;exitCode=$child.ExitCode} | ConvertTo-Json -Compress
} catch {
    if($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223){@{started=$false;canceled=$true} | ConvertTo-Json -Compress}
    else{throw}
}
