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

function Merge-DirectoryPreservingRuntimeData {
    param(
        [Parameter(Mandatory=$true)][string]$SourceDir,
        [Parameter(Mandatory=$true)][string]$DestinationDir
    )

    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    Get-ChildItem -Path $SourceDir -Force | ForEach-Object {
        $target = Join-Path $DestinationDir $_.Name
        if ((Split-Path -Leaf $DestinationDir) -eq 'data' -and $_.Name -eq 'data') {
            Write-Info "Skipping nested packaged data directory: $($_.FullName)"
            Log "Skipped nested packaged data directory: $($_.FullName)"
            return
        }
        if ($_.Name -in @('hub.sqlite3', 'hub.sqlite3-wal', 'hub.sqlite3-shm')) {
            Write-Info "Preserving runtime database file: $($_.Name)"
            Log "Skipped packaged runtime database file: $($_.Name)"
            return
        }
        if ($_.PSIsContainer) {
            Merge-DirectoryPreservingRuntimeData -SourceDir $_.FullName -DestinationDir $target
        } else {
            Copy-Item -Path $_.FullName -Destination $target -Force
        }
    }
}

function Remove-NestedPackagedDataCopy {
    $nestedData = Join-Path $InstallDir "data\data"
    if (-not (Test-Path $nestedData)) { return }

    if (Test-Path (Join-Path $nestedData "hub.sqlite3")) {
        Write-Info "Nested data directory contains hub.sqlite3; leaving it untouched for manual review: $nestedData"
        Log "Nested data directory contains hub.sqlite3; not removing: $nestedData"
        return
    }

    Write-Info "Removing nested packaged data directory: $nestedData"
    Log "Removing nested packaged data directory: $nestedData"
    Remove-Item -Path $nestedData -Recurse -Force
}

function Install-ExtractedHubItem {
    param(
        [Parameter(Mandatory=$true)]$SourceItem,
        [Parameter(Mandatory=$true)][string]$DestinationRoot
    )

    $name = $SourceItem.Name
    $dest = Join-Path $DestinationRoot $name

    # Runtime-owned paths must never be replaced by an update archive. The hub
    # SQLite database lives under data\hub.sqlite3, so deleting data during
    # extraction creates a fresh empty DB and makes existing users unable to log in.
    switch -Regex ($name) {
        '^data$' {
            Write-Info "Merging packaged reference data without deleting runtime data..."
            Log "Merging data directory without deleting runtime files"
            Merge-DirectoryPreservingRuntimeData -SourceDir $SourceItem.FullName -DestinationDir $dest
            return
        }
        '^(venv|logs|backup|media|staticfiles)$' {
            Write-Info "Preserving runtime directory: $name"
            Log "Skipped runtime directory from archive: $name"
            return
        }
        '^\.env$' {
            Write-Info "Preserving installed .env"
            Log "Skipped packaged .env"
            return
        }
    }

    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item -Path $SourceItem.FullName -Destination $dest
}

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

# Backup application code and runtime data before touching the install tree.
# `data` contains hub.sqlite3 and must be restorable if an update fails.
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

$preUpdateDbPath = "$InstallDir\data\hub.sqlite3"
$hadDatabaseBeforeUpdate = Test-Path $preUpdateDbPath

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
        Install-ExtractedHubItem -SourceItem $_ -DestinationRoot $InstallDir
    }
} else {
    Get-ChildItem -Path $tempExtract | ForEach-Object {
        Install-ExtractedHubItem -SourceItem $_ -DestinationRoot $InstallDir
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

if ($hadDatabaseBeforeUpdate -and -not (Test-Path $preUpdateDbPath)) {
    Write-Err "Database disappeared during extraction; restoring runtime data backup."
    Log "ERROR: hub.sqlite3 missing after extraction; restoring data backup"
    $backupData = Join-Path $backupPath "data"
    if (Test-Path $backupData) {
        if (Test-Path "$InstallDir\data") { Remove-Item -Recurse -Force "$InstallDir\data" }
        Copy-Item -Path $backupData -Destination "$InstallDir\data" -Recurse
    }
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    exit 1
}
Remove-NestedPackagedDataCopy
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

# Smart migration: query the DB directly for unapplied migrations so we can
# skip the migrate step entirely on hot upgrades. When migrations ARE pending,
# we run a single `manage.py migrate` invocation rather than one per app --
# Django rebuilds the full migration graph on every invocation, and that
# startup cost (3-5s Python + 5-15s graph build) dominates per-app loops.
# Output is streamed live with --verbosity 2 so the user can see "Applying
# foo.0001_initial... OK" rather than staring at a blank prompt for 20 min.
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
        # Stream output live so user sees progress; also Tee to log file.
        $migrateOutput = & $pythonExe manage.py migrate --noinput --verbosity 2 --traceback 2>&1 |
            Tee-Object -Variable streamed | ForEach-Object { Write-Host "  $_"; $_ }
        $migrateExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        Log "migrate output:`n$($streamed | Out-String)"
        if ($migrateExit -ne 0) {
            Write-Err "Migration failed (exit code $migrateExit)!"
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
    Write-Info "Running migrations (streaming progress)..."
    $migrateExit = 1
    $streamed = $null
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        # Single migrate call streams each "Applying app.NNNN_name... OK" line
        # live to the console so the user sees real-time progress.
        $streamed = & $pythonExe manage.py migrate --noinput --verbosity 2 --traceback 2>&1 |
            ForEach-Object { Write-Host "  $_"; $_ }
        $migrateExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($migrateExit -eq 0) { break }
        $outStr = ($streamed | Out-String)
        if ($outStr -match 'database is locked' -and $attempt -lt 3) {
            Write-Info "  migrate hit 'database is locked' (attempt $attempt/3) -- retrying in 5s..."
            Log "migrate attempt $attempt failed with database lock; retrying"
            Start-Sleep -Seconds 5
            continue
        }
        break
    }
    Log "migrate output:`n$($streamed | Out-String)"
    $migrateFailed = ($migrateExit -ne 0)
    if ($migrateFailed) {
        Write-Err "Migration failed (exit code $migrateExit)!"
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

# --- Step 8b: Refresh hub-shell wrapper ---
Write-Step "8b" "Refreshing hub management wrapper..."
$hubShellContent = @'
<#
.SYNOPSIS
    Vitora Hub management shell -- loads .env and runs a Django manage.py command.

.DESCRIPTION
    Loads C:\VitoraHub\.env into the current process environment so the
    correct settings module, database path, and secret key are used. Then
    invokes `manage.py` with any arguments you pass.

.EXAMPLE
    .\hub-shell.ps1                          # Opens Django shell
    .\hub-shell.ps1 create_superuser --force # Creates a hub-local superuser
    .\hub-shell.ps1 changepassword admin     # Changes a user's password
    .\hub-shell.ps1 migrate                  # Runs migrations
#>

$ErrorActionPreference = "Stop"
$InstallDir = "C:\VitoraHub"

# Load .env into the current process
$envFile = Join-Path $InstallDir ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
} else {
    Write-Warning "No .env file at $envFile -- hub may not start correctly."
}

# Default to `shell` if no args. Always wrap incoming args as an array;
# otherwise Windows PowerShell can treat a single string argument as an
# enumerable and pass only/each character to manage.py (e.g. `c`).
$pyArgs = if ($args.Count -eq 0) { @("shell") } else { @($args) }

Push-Location $InstallDir
try {
    $ErrorActionPreference = "Continue"  # Prevent stderr warnings from terminating
    & "$InstallDir\venv\Scripts\python.exe" "manage.py" @pyArgs
} finally {
    Pop-Location
}
'@
Set-Content -Path "$InstallDir\hub-shell.ps1" -Value $hubShellContent
Write-Ok "Hub management wrapper refreshed."

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
