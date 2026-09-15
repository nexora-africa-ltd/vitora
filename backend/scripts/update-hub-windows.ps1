# ============================================================================
# Vitora HMIS -- Facility Hub Windows Updater
#
# Updates an existing hub installation to the latest (or specified) version.
# Downloads from Azure CDN, stops service, extracts, migrates, restarts.
# Auto-rollback on failure.
# Keeps a single rolling pre-update backup at C:\VitoraHub\backup\pre-update-current.
#
# Usage (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\update-hub-windows.ps1
#   powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\update-hub-windows.ps1 -Version 0.4.0
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
$script:HubArtifactBaseUrls = @(
    "$CdnBaseUrl/hub",
    "$CdnBaseUrl/releases/hub"
)
$AutoUpdateTaskName = "VitoraHubWeeklyUpdate"
$AutoUpdateLogFile = "$LogDir\hub-nightly-update.log"
$AutoUpdateDay = if ($env:HUB_AUTO_UPDATE_DAY) { $env:HUB_AUTO_UPDATE_DAY } else { "Sunday" }
$AutoUpdateTime = if ($env:HUB_AUTO_UPDATE_TIME) { $env:HUB_AUTO_UPDATE_TIME } else { "2:00AM" }

# --- Helper Functions ---
function Write-Step  { param($num, $msg) Write-Host "[STEP $num] $msg" -ForegroundColor Cyan }
function Write-Info  { param($msg) Write-Host "  [INFO] $msg" -ForegroundColor Gray }
function Write-Ok    { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err   { param($msg) Write-Host "  [ERROR] $msg" -ForegroundColor Red }

function Log { param($msg) Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" }

function Initialize-DpapiType {
    if ($script:DpapiTypeInitialized) {
        return $script:DpapiAvailable
    }

    $protectedDataType = [Type]::GetType("System.Security.Cryptography.ProtectedData, System.Security", $false)
    if (-not $protectedDataType) {
        try { Add-Type -AssemblyName "System.Security" -ErrorAction Stop } catch {}
        try { Add-Type -AssemblyName "System.Security.Cryptography.ProtectedData" -ErrorAction Stop } catch {}
        $protectedDataType = [Type]::GetType("System.Security.Cryptography.ProtectedData, System.Security", $false)
        if (-not $protectedDataType) {
            $protectedDataType = [Type]::GetType("System.Security.Cryptography.ProtectedData, System.Security.Cryptography.ProtectedData", $false)
        }
    }

    if (-not $protectedDataType) {
        $script:DpapiTypeInitialized = $true
        $script:DpapiAvailable = $false
        return $false
    }

    $scopeType = [Type]::GetType("System.Security.Cryptography.DataProtectionScope, System.Security", $false)
    if (-not $scopeType) {
        $scopeType = [Type]::GetType("System.Security.Cryptography.DataProtectionScope, System.Security.Cryptography.ProtectedData", $false)
    }
    if (-not $scopeType) {
        $script:DpapiTypeInitialized = $true
        $script:DpapiAvailable = $false
        return $false
    }

    $script:DpapiProtectedDataType = $protectedDataType
    $script:DpapiLocalMachineScope = [Enum]::Parse($scopeType, "LocalMachine")
    $script:DpapiTypeInitialized = $true
    $script:DpapiAvailable = $true
    return $true
}

function Get-HubEnvValue {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [string]$Default = ""
    )
    $value = [System.Environment]::GetEnvironmentVariable($Name)
    if ($value) { return $value }
    return $Default
}

function Build-HubServiceEnvironment {
    return @(
        "DJANGO_ENV=hub",
        "DJANGO_SETTINGS_MODULE=$(Get-HubEnvValue 'DJANGO_SETTINGS_MODULE' 'hmis.settings.hub')",
        "HUB_SECRETS_FILE=$(Get-HubEnvValue 'HUB_SECRETS_FILE' (Join-Path $InstallDir 'secrets\hub-secrets.dpapi.json'))",
        "TIBABOT_ENABLED=$(Get-HubEnvValue 'TIBABOT_ENABLED' 'true')",
        "TIBABOT_API_URL=$(Get-HubEnvValue 'TIBABOT_API_URL')",
        "TIBABOT_API_KEY=$(Get-HubEnvValue 'TIBABOT_API_KEY')",
        "TIBABOT_TIMEOUT=$(Get-HubEnvValue 'TIBABOT_TIMEOUT' '30')",
        "TIBABOT_JWT_PRIVATE_KEY=$(Get-HubEnvValue 'TIBABOT_JWT_PRIVATE_KEY')",
        "TIBABOT_JWT_SECRET=$(Get-HubEnvValue 'TIBABOT_JWT_SECRET')",
        "TIBABOT_JWT_ISSUER=$(Get-HubEnvValue 'TIBABOT_JWT_ISSUER' 'vitora-hmis')",
        "TIBABOT_JWT_AUDIENCE=$(Get-HubEnvValue 'TIBABOT_JWT_AUDIENCE' 'tibabot')",
        "TIBABOT_JWT_EXPIRY_SECONDS=$(Get-HubEnvValue 'TIBABOT_JWT_EXPIRY_SECONDS' '300')",
        "TIBABOT_JWKS_URL=$(Get-HubEnvValue 'TIBABOT_JWKS_URL')",
        "TIBABOT_ADMIN_KEY=$(Get-HubEnvValue 'TIBABOT_ADMIN_KEY')",
        "HUB_CLOUD_AUTH_ENABLED=$(Get-HubEnvValue 'HUB_CLOUD_AUTH_ENABLED' 'true')",
        "HUB_CLOUD_AUTH_URL=$(Get-HubEnvValue 'HUB_CLOUD_AUTH_URL')"
    ) -join "`n"
}

function Resolve-LatestHubVersion {
    $manifestUrls = @(
        "$CdnBaseUrl/hub/latest.json",
        "$CdnBaseUrl/releases/hub/latest.json"
    )

    foreach ($manifestUrl in $manifestUrls) {
        try {
            $manifest = Invoke-RestMethod -Uri $manifestUrl -UseBasicParsing
            if ($manifest.version) {
                $baseUrl = $manifestUrl -replace '/latest\.json$', ''
                $script:HubArtifactBaseUrls = @($baseUrl) + @($script:HubArtifactBaseUrls | Where-Object { $_ -ne $baseUrl })
                return $manifest.version
            }
        } catch {
            continue
        }
    }

    return $null
}

function Register-HubAutoUpdateTask {
    param(
        [Parameter(Mandatory=$true)][string]$TaskName,
        [Parameter(Mandatory=$true)][string]$ScriptPath,
        [Parameter(Mandatory=$true)][string]$LogPath,
        [Parameter(Mandatory=$true)][string]$DayOfWeek,
        [Parameter(Mandatory=$true)][string]$AtTime
    )

    $taskAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" >> `"$LogPath`" 2>&1"
    $taskTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $AtTime
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
    $taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
}

function Write-DpapiSecretsBundle {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Secrets,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $secretDir = Split-Path -Parent $Path
    if (-not (Test-Path $secretDir)) {
        New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
    }

    $plaintext = @{
        version = 1
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        secrets = $Secrets
    } | ConvertTo-Json -Compress

    if (-not (Initialize-DpapiType)) {
        $payload = @{
            version = 1
            scope = "PlaintextFallback"
            generated_at = (Get-Date).ToUniversalTime().ToString("o")
            secrets = $Secrets
        } | ConvertTo-Json
        Set-Content -Path $Path -Value $payload
        Write-Info "DPAPI unavailable; wrote plaintext secret bundle fallback at $Path"
        Log "WARN: DPAPI unavailable; wrote plaintext secret bundle fallback"
        return
    }

    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plaintext)
    $cipherBytes = $script:DpapiProtectedDataType::Protect(
        $plainBytes,
        $null,
        $script:DpapiLocalMachineScope
    )

    $payload = @{
        version = 1
        scope = "LocalMachine"
        ciphertext_b64 = [Convert]::ToBase64String($cipherBytes)
        keys = @($Secrets.Keys | Sort-Object)
    } | ConvertTo-Json

    Set-Content -Path $Path -Value $payload
}

function Get-HubPortFromEnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$EnvFilePath,
        [string]$DefaultPort = "9088"
    )

    if (-not (Test-Path $EnvFilePath)) {
        return $DefaultPort
    }

    $portLine = Get-Content $EnvFilePath | Where-Object { $_ -match '^HUB_PORT=' } | Select-Object -First 1
    if (-not $portLine) {
        return $DefaultPort
    }

    $resolved = ($portLine -split "=", 2)[1].Trim()
    if (-not $resolved) {
        return $DefaultPort
    }

    return $resolved
}

function Get-PortListenerProcess {
    param([Parameter(Mandatory = $true)][int]$Port)

    try {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $listener) {
            return $null
        }

        $pid = [int]$listener.OwningProcess
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        $path = $null
        if ($proc) {
            try { $path = $proc.Path } catch { $path = $null }
        }

        $commandLine = $null
        try {
            $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
            if ($wmi) {
                $commandLine = $wmi.CommandLine
                if (-not $path -and $wmi.ExecutablePath) {
                    $path = $wmi.ExecutablePath
                }
            }
        } catch {
            $commandLine = $null
        }

        return [PSCustomObject]@{
            Port = $Port
            ProcessId = $pid
            Name = if ($proc) { $proc.ProcessName } else { "unknown" }
            Path = $path
            CommandLine = $commandLine
        }
    } catch {
        return $null
    }
}

function Ensure-HubPortAvailable {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$InstallRoot
    )

    $owner = Get-PortListenerProcess -Port $Port
    if (-not $owner) {
        return $true
    }

    $ownerPath = if ($owner.Path) { [string]$owner.Path } else { "" }
    $ownerCmd = if ($owner.CommandLine) { [string]$owner.CommandLine } else { "" }
    $isHubOwned = $false

    if ($ownerPath -and $ownerPath.StartsWith($InstallRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $isHubOwned = $true
    }
    if (-not $isHubOwned -and $ownerCmd -and $ownerCmd.IndexOf($InstallRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $isHubOwned = $true
    }

    if (-not $isHubOwned) {
        Write-Err "Port $Port is in use by PID $($owner.ProcessId) ($($owner.Name))."
        Write-Err "Process path: $ownerPath"
        Write-Err "Refusing to kill a non-hub process. Free the port or change HUB_PORT before retrying."
        Log "ERROR: non-hub process owns port $Port (PID=$($owner.ProcessId), Name=$($owner.Name), Path=$ownerPath)"
        return $false
    }

    Write-Info "Port $Port is in use by stale hub-owned PID $($owner.ProcessId) ($($owner.Name)). Stopping it..."
    Log "Port $Port owned by stale hub process PID $($owner.ProcessId); terminating"

    try {
        Stop-Process -Id $owner.ProcessId -Force -ErrorAction Stop
    } catch {
        Write-Err "Failed to stop stale hub process on port ${Port}: $($_.Exception.Message)"
        Log "ERROR: failed to stop stale process PID $($owner.ProcessId) on port $Port"
        return $false
    }

    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (-not (Get-PortListenerProcess -Port $Port)) {
            Write-Ok "Port $Port is now available."
            Log "Port $Port cleared after terminating stale process"
            return $true
        }
    }

    Write-Err "Port $Port is still in use after stopping stale hub process."
    Log "ERROR: port $Port still in use after stale process termination"
    return $false
}

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
    $Version = Resolve-LatestHubVersion
    if (-not $Version) {
        Write-Err "Failed to fetch latest version manifest. Tried:"
        Write-Err "  $CdnBaseUrl/hub/latest.json"
        Write-Err "  $CdnBaseUrl/releases/hub/latest.json"
        exit 1
    }
    Write-Info "Latest version: $Version"
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

$downloadSucceeded = $false
$downloadErrors = @()
foreach ($baseUrl in $script:HubArtifactBaseUrls) {
    $candidateUrl = "$baseUrl/vitora-hub-${Version}.zip"
    try {
        Invoke-WebRequest -Uri $candidateUrl -OutFile $tempArchive -UseBasicParsing
        $ArtifactUrl = $candidateUrl
        $downloadSucceeded = $true
        Write-Ok "Downloaded successfully."
        break
    } catch {
        $downloadErrors += $candidateUrl
    }
}

if (-not $downloadSucceeded) {
    Write-Err "Failed to download release artifact. Tried:"
    foreach ($failedUrl in $downloadErrors) {
        Write-Err "  $failedUrl"
    }
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
            Where-Object { if ($_.Path) { $_.Path.StartsWith($InstallDir) } else { $false } }
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
$backupPath = "$BackupDir\pre-update-current"
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

# Keep a single rolling pre-update snapshot to prevent unbounded backup growth.
Get-ChildItem -Path $BackupDir -Directory -Filter "pre-update-*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "pre-update-current" } |
    ForEach-Object {
        Remove-Item -Path $_.FullName -Recurse -Force
        Log "Removed legacy backup directory: $($_.FullName)"
    }

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
    # pip can emit benign warnings to stderr (e.g. dist-info metadata notices).
    # Under ErrorActionPreference=Stop, that becomes NativeCommandError and
    # aborts the whole update even when pip exits 0. Relax error preference for
    # this native command and gate on LASTEXITCODE instead.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $pipOutput = & $pip install --require-hashes -r "$InstallDir\requirements-hub.txt" --quiet 2>&1
    $pipExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP

    Log "pip install output:`n$($pipOutput | Out-String)"

    if ($pipExit -ne 0) {
        Write-Err "Dependency update failed (exit code $pipExit)."
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
        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
        Log "ROLLBACK: dependency update failed (exit $pipExit)"
        exit 1
    }

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

$hubSecretsFile = if ($env:HUB_SECRETS_FILE) {
    $env:HUB_SECRETS_FILE
} else {
    Join-Path $InstallDir "secrets\hub-secrets.dpapi.json"
}

$dpapiSecrets = @{
    DJANGO_SECRET_KEY = (Get-HubEnvValue "DJANGO_SECRET_KEY")
    ENCRYPTION_KEY = (Get-HubEnvValue "ENCRYPTION_KEY")
    PII_HMAC_KEY = (Get-HubEnvValue "PII_HMAC_KEY")
    LICENSE_TOKEN = (Get-HubEnvValue "LICENSE_TOKEN")
    TIBABOT_API_KEY = (Get-HubEnvValue "TIBABOT_API_KEY")
    TIBABOT_JWT_PRIVATE_KEY = (Get-HubEnvValue "TIBABOT_JWT_PRIVATE_KEY")
    TIBABOT_JWT_SECRET = (Get-HubEnvValue "TIBABOT_JWT_SECRET")
    TIBABOT_ADMIN_KEY = (Get-HubEnvValue "TIBABOT_ADMIN_KEY")
}
Write-DpapiSecretsBundle -Secrets $dpapiSecrets -Path $hubSecretsFile
Write-Info "Refreshed DPAPI secret bundle."
Log "DPAPI secret bundle refreshed"

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

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$CommandArgs
)

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

# Splat $CommandArgs directly. Assigning to an intermediate variable would
# cause PowerShell to unwrap a single-element array into a bare string, and
# `@stringVar` then splats it as a char array (turning `hub_sync` into `h`).
Push-Location $InstallDir
$exitCode = 0
try {
    $ErrorActionPreference = "Continue"  # Prevent stderr warnings from terminating
    if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
        & "$InstallDir\venv\Scripts\python.exe" "manage.py" "shell"
    } else {
        & "$InstallDir\venv\Scripts\python.exe" "manage.py" @CommandArgs
    }
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $exitCode
'@
Set-Content -Path "$InstallDir\hub-shell.ps1" -Value $hubShellContent
Write-Ok "Hub management wrapper refreshed."

# Refresh service launcher script from packaged template.
$launcherTemplate = "$InstallDir\scripts\start-hub-windows.ps1"
$launcherPath = "$InstallDir\start-hub.ps1"
if (Test-Path $launcherTemplate) {
    Copy-Item -Path $launcherTemplate -Destination $launcherPath -Force
    Write-Ok "Service launcher refreshed."
    Log "Service launcher refreshed"
} else {
    if (Test-Path $launcherPath) {
        Write-Info "Missing launcher template: $launcherTemplate"
        Write-Info "Using existing launcher at $launcherPath"
        Log "WARN: missing launcher template; using existing launcher"
    } else {
        Write-Err "Missing launcher template: $launcherTemplate"
        Write-Err "No existing launcher found at $launcherPath"
        Log "ERROR: missing launcher template and existing launcher"
        exit 1
    }
}

# Refresh NSSM service environment from the preserved .env before restart.
$nssmExe = "$InstallDir\nssm\nssm.exe"
if (Test-Path $nssmExe) {
    $powershellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $launcherArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""

    & $nssmExe set $ServiceName Application $powershellExe 2>&1 | Out-Null
    & $nssmExe set $ServiceName AppParameters $launcherArgs 2>&1 | Out-Null
    & $nssmExe set $ServiceName AppDirectory $InstallDir 2>&1 | Out-Null

    $envVars = Build-HubServiceEnvironment
    & $nssmExe set $ServiceName AppEnvironmentExtra $envVars 2>&1 | Out-Null
    Write-Ok "Service launcher and environment refreshed."
    Log "Service launcher and environment refreshed"
} else {
    Write-Info "NSSM not found at $nssmExe; service environment was not refreshed."
    Log "NSSM not found; service environment not refreshed"
}

# --- Step 8c: Refresh weekly auto-update task ---
Write-Step "8c" "Refreshing weekly auto-update task..."
try {
    Register-HubAutoUpdateTask -TaskName $AutoUpdateTaskName -ScriptPath "$InstallDir\scripts\update-hub-windows.ps1" -LogPath $AutoUpdateLogFile -DayOfWeek $AutoUpdateDay -AtTime $AutoUpdateTime
    Write-Ok "Scheduled task '$AutoUpdateTaskName' refreshed ($AutoUpdateDay $AutoUpdateTime)."
    Log "Scheduled task refreshed"
} catch {
    Write-Info "Unable to refresh scheduled task '$AutoUpdateTaskName': $_"
    Log "Scheduled task refresh failed"
}

# --- Step 9: Start service ---
Write-Step 9 "Starting $ServiceName service..."
$hubPort = [int](Get-HubPortFromEnvFile -EnvFilePath "$InstallDir\.env" -DefaultPort "9088")
if (-not (Ensure-HubPortAvailable -Port $hubPort -InstallRoot $InstallDir)) {
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
    Log "ROLLBACK: port $hubPort unavailable before service start"
    exit 1
}

$startFailed = $false
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
} catch {
    Write-Err "Failed to start $ServiceName service: $($_.Exception.Message)"
    Log "ERROR: Start-Service failed: $($_.Exception.Message)"
    $startFailed = $true
}

Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $startFailed -and $svc -and $svc.Status -eq 'Running') {
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
$hubPort = Get-HubPortFromEnvFile -EnvFilePath "$InstallDir\.env" -DefaultPort "9088"

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
