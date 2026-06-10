# ============================================================================
# Vitora HMIS — Facility Hub Windows Updater
#
# Updates an existing hub installation to the latest (or specified) version.
# Downloads from Azure CDN, stops service, extracts, migrates, restarts.
# Auto-rollback on failure.
#
# Usage (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\update-hub.ps1
#   powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\update-hub.ps1 -Version 0.4.0
# ============================================================================

#Requires -RunAsAdministrator
param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

# --- Configuration ---
$CdnBaseUrl = "https://get.vitora.digital"
$ServiceName = "VitoraHub"
$InstallDir = "C:\VitoraHub"
$VenvDir = "$InstallDir\venv"
$BackupDir = "$InstallDir\backup"
$LogDir = "$InstallDir\logs"
$LogFile = "$LogDir\update-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# --- Helper Functions ---
function Write-Step  { param($num, $msg) Write-Host "[STEP $num] $msg" -ForegroundColor Cyan }
function Write-Info  { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Write-Ok    { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err   { param($msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }

function Log { param($msg) Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" }

# --- Pre-flight checks ---
if (-not (Test-Path "$InstallDir\manage.py")) {
    Write-Err "Hub installation not found at $InstallDir"
    Write-Err "Run the installer first: irm $CdnBaseUrl/hub.ps1 | iex"
    exit 1
}

# Ensure log dir exists
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Log "Update started"

# --- Read current version ---
$CurrentVersion = "unknown"
if (Test-Path "$InstallDir\VERSION") {
    $CurrentVersion = (Get-Content "$InstallDir\VERSION" -Raw).Trim()
}
Write-Info "Current version: $CurrentVersion"
Log "Current version: $CurrentVersion"

# --- Step 1: Resolve target version ---
Write-Step 1 "Resolving target version..."

if ($Version) {
    Write-Info "Using specified version: $Version"
} else {
    try {
        $manifest = Invoke-RestMethod -Uri "$CdnBaseUrl/hub/latest.json" -UseBasicParsing
        $Version = $manifest.version
        Write-Info "Latest version: $Version"
    } catch {
        Write-Err "Failed to fetch latest version from $CdnBaseUrl/hub/latest.json"
        exit 1
    }
}

if ($Version -eq $CurrentVersion) {
    Write-Ok "Already running version $Version. Nothing to update."
    exit 0
}

Write-Info "Updating: $CurrentVersion -> $Version"
Log "Updating: $CurrentVersion -> $Version"

# --- Step 2: Download new release ---
Write-Step 2 "Downloading vitora-hub-${Version}..."

$ArtifactUrl = "$CdnBaseUrl/hub/vitora-hub-${Version}.zip"
$tempArchive = "$env:TEMP\vitora-hub-${Version}.zip"

try {
    Invoke-WebRequest -Uri $ArtifactUrl -OutFile $tempArchive -UseBasicParsing
    Write-Ok "Downloaded successfully."
} catch {
    Write-Err "Failed to download: $ArtifactUrl"
    exit 1
}

# --- Step 3: Stop service ---
Write-Step 3 "Stopping $ServiceName service..."
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 3
    Write-Ok "Service stopped."
} else {
    Write-Info "Service not running."
}
Log "Service stopped"

# --- Step 4: Backup current installation ---
Write-Step 4 "Creating backup..."
$backupPath = "$BackupDir\pre-update-$CurrentVersion"
if (Test-Path $backupPath) { Remove-Item -Recurse -Force $backupPath }
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Backup application code (not venv, data, or logs)
$itemsToBackup = @("hmis", "data", "manage.py", "requirements-hub.txt", "VERSION", "scripts")
foreach ($item in $itemsToBackup) {
    $src = Join-Path $InstallDir $item
    if (Test-Path $src) {
        $dest = Join-Path $backupPath $item
        if ((Get-Item $src).PSIsContainer) {
            Copy-Item -Path $src -Destination $dest -Recurse
        } else {
            Copy-Item -Path $src -Destination $dest
        }
    }
}
Write-Ok "Backed up to $backupPath"
Log "Backup created: $backupPath"

# --- Step 5: Extract new version ---
Write-Step 5 "Extracting new version..."

# Remove old application code
foreach ($item in @("hmis", "requirements-hub.txt")) {
    $target = Join-Path $InstallDir $item
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
    }
}

# Extract
$tempExtract = "$env:TEMP\vitora-hub-extract"
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
Expand-Archive -Path $tempArchive -DestinationPath $tempExtract -Force

$innerDir = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
if ($innerDir) {
    Get-ChildItem -Path $innerDir.FullName | ForEach-Object {
        $dest = Join-Path $InstallDir $_.Name
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Move-Item -Path $_.FullName -Destination $dest
    }
} else {
    Get-ChildItem -Path $tempExtract | ForEach-Object {
        $dest = Join-Path $InstallDir $_.Name
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Move-Item -Path $_.FullName -Destination $dest
    }
}
Remove-Item -Path $tempArchive -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path "$InstallDir\manage.py")) {
    Write-Err "Extraction failed! Restoring backup..."
    # Rollback
    foreach ($item in $itemsToBackup) {
        $src = Join-Path $backupPath $item
        $dest = Join-Path $InstallDir $item
        if (Test-Path $src) {
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            if ((Get-Item $src).PSIsContainer) {
                Copy-Item -Path $src -Destination $dest -Recurse
            } else {
                Copy-Item -Path $src -Destination $dest
            }
        }
    }
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Write-Err "Rolled back to $CurrentVersion"
    Log "ROLLBACK: extraction failed"
    exit 1
}
Write-Ok "Extracted."
Log "Extracted version $Version"

# --- Step 6: Update dependencies ---
Write-Step 6 "Updating Python dependencies..."
$pip = "$VenvDir\Scripts\pip.exe"
if (Test-Path "$InstallDir\requirements-hub.txt") {
    & $pip install -r "$InstallDir\requirements-hub.txt" --quiet 2>&1 | Out-Null
    Write-Ok "Dependencies updated."
} else {
    Write-Info "No requirements-hub.txt found, skipping."
}
Log "Dependencies updated"

# --- Step 7: Run migrations ---
Write-Step 7 "Running database migrations..."
$pythonExe = "$VenvDir\Scripts\python.exe"
$env:DJANGO_SETTINGS_MODULE = "hmis.settings.development"
Push-Location $InstallDir
try {
    & $pythonExe manage.py migrate --noinput 2>&1 | Out-Null
    Write-Ok "Migrations complete."
} catch {
    Write-Err "Migration failed! Restoring backup..."
    # Rollback
    foreach ($item in $itemsToBackup) {
        $src = Join-Path $backupPath $item
        $dest = Join-Path $InstallDir $item
        if (Test-Path $src) {
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            if ((Get-Item $src).PSIsContainer) {
                Copy-Item -Path $src -Destination $dest -Recurse
            } else {
                Copy-Item -Path $src -Destination $dest
            }
        }
    }
    Pop-Location
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Write-Err "Rolled back to $CurrentVersion"
    Log "ROLLBACK: migration failed"
    exit 1
}
Pop-Location
Log "Migrations applied"

# --- Step 8: Collect static files ---
Write-Step 8 "Collecting static files..."
Push-Location $InstallDir
& $pythonExe manage.py collectstatic --noinput 2>&1 | Out-Null
Pop-Location
Write-Ok "Static files collected."

# --- Step 9: Start service ---
Write-Step 9 "Starting $ServiceName service..."
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
if ($svc.Status -eq 'Running') {
    Write-Ok "Service running."
} else {
    Write-Err "Service failed to start! Check logs at $LogDir"
    Write-Err "Rolling back..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    foreach ($item in $itemsToBackup) {
        $src = Join-Path $backupPath $item
        $dest = Join-Path $InstallDir $item
        if (Test-Path $src) {
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
            if ((Get-Item $src).PSIsContainer) {
                Copy-Item -Path $src -Destination $dest -Recurse
            } else {
                Copy-Item -Path $src -Destination $dest
            }
        }
    }
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Log "ROLLBACK: service failed to start"
    exit 1
}
Log "Service restarted"

# --- Step 10: Verify ---
Write-Step 10 "Verifying health..."
Start-Sleep -Seconds 2

# Read port from .env if available
$hubPort = "9088"
$envFile = "$InstallDir\.env"
if (Test-Path $envFile) {
    $portLine = Get-Content $envFile | Where-Object { $_ -match "^HUB_PORT=" }
    if ($portLine) { $hubPort = ($portLine -split "=", 2)[1].Trim() }
}

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:${hubPort}/api/hub/health/" -TimeoutSec 5
    Write-Ok "Hub responding on port $hubPort"
} catch {
    Write-Info "Health check failed (service may still be starting)"
}

# --- Done ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Update complete: $CurrentVersion -> $Version" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Log "Update complete: $CurrentVersion -> $Version"
