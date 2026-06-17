# ============================================================================
# Vitora HMIS -- Facility Hub Windows Updater
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
    # Wait for the service to fully stop AND for any child Python process to
    # release SQLite WAL/SHM file handles. A flat 3s sleep was racy and caused
    # spurious "database is locked" failures during migrate on slower hardware.
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        $svc.Refresh()
        $pythonStillRunning = Get-Process -Name "python" -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir) }
        if ($svc.Status -eq 'Stopped' -and -not $pythonStillRunning) { break }
        Start-Sleep -Milliseconds 500
    }
    # Final settling for SQLite WAL checkpoint
    Start-Sleep -Seconds 2
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

# Load .env if present (may set DJANGO_SETTINGS_MODULE, HUB_DB_PATH, etc.)
$envFile = "$InstallDir\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"').Trim("'"))
        }
    }
}
# Default to hub settings (uses hub.sqlite3, not vitora.db)
if (-not $env:DJANGO_SETTINGS_MODULE) {
    $env:DJANGO_SETTINGS_MODULE = "hmis.settings.hub"
}
$env:DJANGO_ENV = "hub"
Push-Location $InstallDir

# Smart per-app migration: Django's `migrate` loads ALL migration files and
# builds the full dependency graph even when only a handful are unapplied.
# On slow Windows hardware with SQLite this scan takes 30-40 min. Instead
# we query the DB to find apps with unapplied migrations and run `migrate
# <app>` only for those -- dramatically faster on version upgrades.
$dbPath = if ($env:HUB_DB_PATH) { $env:HUB_DB_PATH } else { "$InstallDir\data\hub.sqlite3" }
$appsToMigrate = @()
if (Test-Path $dbPath) {
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $appsToMigrate = (& $pythonExe -c "
import os, sqlite3, pathlib, json
db = r'$dbPath'
apps_dir = os.path.join(r'$InstallDir', 'hmis', 'apps')
conn = sqlite3.connect(db)
cur = conn.cursor()
try:
    cur.execute('SELECT app, name FROM django_migrations')
    applied = set()
    for row in cur.fetchall():
        applied.add((row[0], row[1]))
except Exception:
    applied = set()
conn.close()

need = []
for app_dir in sorted(pathlib.Path(apps_dir).iterdir()):
    mig_dir = app_dir / 'migrations'
    if not mig_dir.is_dir():
        continue
    app_label = app_dir.name
    for f in sorted(mig_dir.glob('*.py')):
        if f.name == '__init__.py':
            continue
        mig_name = f.stem
        if (app_label, mig_name) not in applied:
            need.append(app_label)
            break
print(json.dumps(need))
" 2>$null) | ConvertFrom-Json
    $ErrorActionPreference = $prevEAP
}

if ($null -eq $appsToMigrate -or $appsToMigrate.Count -eq 0) {
    if (Test-Path $dbPath) {
        Write-Ok "All migrations already applied -- skipping."
        Log "No unapplied migrations found"
    } else {
        # DB doesn't exist (shouldn't happen on update, but handle gracefully)
        Write-Info "No database found -- running full migration..."
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        $migrateOutput = & $pythonExe manage.py migrate --noinput --traceback 2>&1
        $migrateExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        Log "migrate output:`n$($migrateOutput | Out-String)"
        if ($migrateExit -ne 0) {
            Write-Err "Migration failed (exit code $migrateExit)!"
            Write-Host ($migrateOutput | Out-String) -ForegroundColor Red
            Write-Err "Restoring backup..."
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
            Log "ROLLBACK: migration failed (exit $migrateExit)"
            exit 1
        }
    }
} else {
    Write-Info "$($appsToMigrate.Count) app(s) need migration: $($appsToMigrate -join ', ')"
    Log "Apps to migrate: $($appsToMigrate -join ', ')"
    $migrateFailed = $false
    foreach ($app in $appsToMigrate) {
        Write-Info "  Migrating $app..."
        $migrateOutput = $null
        $migrateExit = 1
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            $migrateOutput = & $pythonExe manage.py migrate $app --noinput --traceback 2>&1
            $migrateExit = $LASTEXITCODE
            $ErrorActionPreference = $prevEAP
            if ($migrateExit -eq 0) { break }
            $outStr = ($migrateOutput | Out-String)
            if ($outStr -match 'database is locked' -and $attempt -lt 3) {
                Write-Info "  Migrate $app hit 'database is locked' (attempt $attempt/3) -- retrying in 5s..."
                Log "migrate $app attempt $attempt failed with database lock; retrying"
                Start-Sleep -Seconds 5
                continue
            }
            break
        }
        Log "migrate $app output:`n$($migrateOutput | Out-String)"
        if ($migrateExit -ne 0) {
            Write-Err "Migration failed for $app (exit code $migrateExit)!"
            Write-Host ($migrateOutput | Out-String) -ForegroundColor Red
            $migrateFailed = $true
            break
        }
    }
    if ($migrateFailed) {
        Write-Err "Restoring backup..."
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
}
Write-Ok "Migrations complete."
Pop-Location
Log "Migrations applied"

# --- Step 8: Collect static files ---
Write-Step 8 "Collecting static files..."
Push-Location $InstallDir
$prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
& $pythonExe manage.py collectstatic --noinput 2>&1 | Out-Null
$ErrorActionPreference = $prevEAP
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
