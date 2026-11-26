<#
.SYNOPSIS
  Perseus Bound build script (Windows PowerShell 5.1+ / PowerShell 7+).

.DESCRIPTION
  Installs dependencies, runs the smoke and rules tests, and builds dist\perseus-bound.html.
  Exits non-zero on any failure, so it can be used as-is in CI.

.EXAMPLE
  .\build.ps1
.EXAMPLE
  .\build.ps1 -SkipTests
.EXAMPLE
  .\build.ps1 -SkipInstall -Games 200
.EXAMPLE
  .\build.ps1 -Clean

.NOTES
  If Windows blocks the script ("running scripts is disabled on this system"), either run:
    powershell -ExecutionPolicy Bypass -File .\build.ps1
  or allow local scripts once for your user:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$SkipInstall,
  [switch]$Clean,
  [ValidateRange(1, 100000)][int]$Games = 10
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Fail([string]$Message) {
  Write-Host "`nBUILD FAILED: $Message" -ForegroundColor Red
  exit 1
}
# Run a native command and fail the build if it returns a non-zero exit code.
function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE)." }
}

Step 'Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js is not installed. Get the LTS version from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS)'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail 'npm is not on PATH (it normally comes with Node.js). Try opening a new terminal after installing Node.'
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { Fail "Node.js 18 or newer is required (found $(node -v))." }
Write-Host "node $(node -v), npm $(npm -v)"

if ($Clean) {
  Step 'Cleaning'
  foreach ($dir in 'node_modules', 'dist') {
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
  }
}

if (-not $SkipInstall) {
  Step 'Installing dependencies'
  if (Test-Path -LiteralPath 'package-lock.json') {
    Invoke-Checked 'npm ci' { npm ci --no-audit --no-fund }
  } else {
    Invoke-Checked 'npm install' { npm install --no-audit --no-fund }
  }
}

if (-not $SkipTests) {
  Step "Running smoke test ($Games games)"
  Invoke-Checked 'Smoke test' { node scripts/smoke-test.mjs $Games }
  Step 'Running rules test'
  Invoke-Checked 'Rules test' { node scripts/rules-test.mjs }
}

Step 'Building'
Invoke-Checked 'vite build' { npx vite build }
if (-not (Test-Path -LiteralPath 'dist/index.html')) { Fail 'dist/index.html was not produced.' }
Copy-Item -LiteralPath 'dist/index.html' -Destination 'dist/perseus-bound.html' -Force

$size = (Get-Item -LiteralPath 'dist/perseus-bound.html').Length
Step "Done: dist\perseus-bound.html ($size bytes)"
