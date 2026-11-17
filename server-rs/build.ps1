$ErrorActionPreference = "Stop"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (!(Test-Path $vswhere)) {
  throw "vswhere.exe not found. Install Visual Studio 2022 C++ build tools."
}
$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $vsPath "VC\Auxiliary\Build\vcvars64.bat"
if (!(Test-Path $vcvars)) {
  throw "vcvars64.bat not found: $vcvars"
}

$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (!(Test-Path $cargo)) {
  throw "cargo.exe not found: $cargo"
}

$manifest = Join-Path $PSScriptRoot "Cargo.toml"
cmd.exe /c "call `"$vcvars`" >nul && `"$cargo`" build --release --manifest-path `"$manifest`""
