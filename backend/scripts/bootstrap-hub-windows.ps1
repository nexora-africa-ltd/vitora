# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# Vitora HMIS Hub - Windows Bootstrap Installer
#
# Usage:
#   irm https://get.vitora.digital/hub.ps1 | iex
#
# This tiny bootstrap downloads the real installer to a temp file and
# executes it as a child process. Doing so isolates any `exit N` calls
# in the real installer from the user's PowerShell host - otherwise
# `irm | iex` would terminate the user's terminal on the first error,
# closing the window before the operator can read the message.

$ErrorActionPreference = 'Stop'

$CdnBaseUrl = 'https://get.vitora.digital'
$InstallerUrl = "$CdnBaseUrl/install-hub-windows.ps1"
$TempScript = Join-Path $env:TEMP "vitora-hub-install-$([guid]::NewGuid()).ps1"

Write-Host ""
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host "|      Vitora HMIS - Facility Hub Bootstrap        |" -ForegroundColor Cyan
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Downloading installer..." -ForegroundColor Gray

try {
    Invoke-WebRequest -Uri $InstallerUrl -OutFile $TempScript -UseBasicParsing
} catch {
    Write-Host "[ERROR] Failed to download installer from $InstallerUrl" -ForegroundColor Red
    Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Press any key to close..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    return
}

Write-Host "[INFO] Launching installer..." -ForegroundColor Gray
Write-Host ""

# Run as child PowerShell so `exit N` in the installer cannot kill this host.
# -NoProfile keeps startup fast and avoids inheriting user profile customizations.
# Forward any extra args that were piped through (e.g. -Version 0.4.1).
$psArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $TempScript
) + $args

$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $psArgs -NoNewWindow -PassThru -Wait
$exitCode = $process.ExitCode

# Clean up temp installer.
Remove-Item -LiteralPath $TempScript -Force -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Installer exited with code $exitCode." -ForegroundColor Red
    Write-Host "        Scroll up to read the error message above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press any key to close..." -ForegroundColor Gray
    # Pause so the user can read the error before the iex'd session ends.
    # Skip the pause if STDIN is not interactive (e.g. CI).
    if ([Console]::IsInputRedirected -eq $false) {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    }
}
