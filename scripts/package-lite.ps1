# Builds tracking-lite.zip (apps/lite without node_modules/.next) for
# uploading to a Hostinger Node.js web app. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File scripts\package-lite.ps1
$ErrorActionPreference = 'Stop'
$root  = Resolve-Path (Join-Path $PSScriptRoot '..')
$src   = Join-Path $root 'apps\lite'
$out   = Join-Path $root 'tracking-lite.zip'
$stage = Join-Path $env:TEMP 'tracking-lite-pkg'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
robocopy $src $stage /E /XD node_modules .next /XF .env .env.local *.tsbuildinfo next-env.d.ts /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

if (Test-Path $out) { Remove-Item $out -Force }
# tar.exe writes forward-slash paths, which Linux servers need; Windows
# PowerShell's Compress-Archive can write backslashes instead.
tar.exe -a -c -f $out -C $stage .
if ($LASTEXITCODE -ne 0) { throw "tar failed ($LASTEXITCODE)" }
Remove-Item $stage -Recurse -Force

"Created $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
