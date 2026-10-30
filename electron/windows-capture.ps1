param([Parameter(Mandatory=$true)][long]$WindowHandle, [Parameter(Mandatory=$true)][uint32]$OwnerPid, [switch]$IncludeCursor)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
try {
    $framework=[System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
    $references=@('System.dll','System.Core.dll','System.Drawing.dll','System.Runtime.dll','System.Runtime.WindowsRuntime.dll','System.Runtime.InteropServices.WindowsRuntime.dll','System.ObjectModel.dll') | ForEach-Object { Join-Path $framework $_ }
    $references+=Get-ChildItem -LiteralPath "$env:windir/System32/WinMetadata" -Filter '*.winmd' | ForEach-Object FullName
    # Add-Type resolves references as CLR assemblies and rejects .winmd files.
    # CodeDOM passes metadata references directly to the framework compiler.
    $parameters=New-Object System.CodeDom.Compiler.CompilerParameters
    $parameters.GenerateInMemory=$true
    $parameters.GenerateExecutable=$false
    foreach($reference in $references){[void]$parameters.ReferencedAssemblies.Add($reference)}
    $provider=New-Object Microsoft.CSharp.CSharpCodeProvider
    $compiled=$provider.CompileAssemblyFromFile($parameters,(Join-Path $PSScriptRoot 'windows-capture.cs'))
    if($compiled.Errors.HasErrors){throw (($compiled.Errors | ForEach-Object ToString) -join "`n")}
    [NikkeWindowsCapture]::Capture($WindowHandle,$OwnerPid,$IncludeCursor.IsPresent)
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    exit 1
}
