param([Parameter(Mandatory=$true)][string]$ProjectRoot,[Parameter(Mandatory=$true)][string]$CacheRoot,[Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$projectPath=[IO.Path]::GetFullPath($ProjectRoot)
$requestPath=[IO.Path]::GetFullPath($RequestFile)
$basePath=[IO.Path]::GetFullPath((Join-Path $CacheRoot 'maanikke-collection'))
if([IO.Path]::GetFileName($requestPath) -ne 'request.json' -or [IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($requestPath)) -ne $basePath){throw 'Invalid collection request path'}
$requestData=Get-Content -LiteralPath $requestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($requestData.action -ne 'collect-roster' -or $requestData.version -ne 1){throw 'Invalid collection action'}
$pythonPath=Join-Path $projectPath 'runtime\python.exe'
if(-not (Test-Path -LiteralPath $pythonPath)){$pythonPath=[IO.Path]::GetFullPath((Join-Path $projectPath '..\codex temp\nikke-desktop\automation-dev-copy\runtime\Scripts\python.exe'))}
$scriptPath=Join-Path $projectPath 'automation\maanikke\collection_worker.py'
try{
 $arguments='-I -B -X utf8 "'+$scriptPath+'" "'+$requestPath+'"'
 $child=Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $projectPath -Verb RunAs -WindowStyle Hidden -PassThru -Wait
 @{canceled=$false;exitCode=$child.ExitCode}|ConvertTo-Json -Compress
}catch{
 if($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223){@{canceled=$true}|ConvertTo-Json -Compress}else{throw}
}
