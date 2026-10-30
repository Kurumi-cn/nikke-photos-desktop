param([string]$Folder,[string]$Nonce)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing,System.Web.Extensions
Add-Type -Path (Join-Path $PSScriptRoot 'input_receiver.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PhotosInputReceiver]::Run($Folder,$Nonce)
