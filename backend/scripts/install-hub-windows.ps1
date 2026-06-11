# ============================================================================
# Vitora HMIS — Facility Hub Windows Installer
#
# Installs and configures the Django backend as a local facility hub
# running as a Windows service via NSSM (Non-Sucking Service Manager).
#
# Downloads a pre-built release artifact from Azure CDN — no repo clone needed.
#
# Usage (Run as Administrator):
#   # Download and run (one-liner):
#   irm https://get.vitora.digital/hub.ps1 | iex
#
#   # Or with specific version:
#   powershell -ExecutionPolicy Bypass -File install-hub-windows.ps1 -Version 0.3.1
#
#   # Non-interactive (for automation):
#   $env:HUB_ID="hub-1"; $env:HUB_FACILITY_ID="fac-1"; ...
#   powershell -ExecutionPolicy Bypass -File install-hub-windows.ps1 -NonInteractive
#
# Prerequisites:
#   - Windows 10/11 or Windows Server 2019+
#   - Python 3.11+ installed and on PATH
#   - Administrator privileges
# ============================================================================

#Requires -RunAsAdministrator
param(
    [string]$Version = "",
    [string]$Port = "",
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

# --- Configuration ---
$CdnBaseUrl = "https://get.vitora.digital"
$AppName = "VitoraHub"
$ServiceName = "VitoraHub"
$ServiceDisplayName = "Vitora HMIS Facility Hub"
$ServiceDescription = "Local facility hub for Vitora HMIS offline-first sync"
$InstallDir = "C:\VitoraHub"
$VenvDir = "$InstallDir\venv"
$DataDir = "$InstallDir\data"
$LogDir = "$InstallDir\logs"
$HubPort = if ($Port) { $Port } elseif ($env:HUB_PORT) { $env:HUB_PORT } else { "9088" }
$NssmUrls = @(
    "https://get.vitora.digital/tools/nssm-2.24.zip",
    "https://nssm.cc/release/nssm-2.24.zip"
)
$NssmDir = "$InstallDir\nssm"

# --- Helper Functions ---
function Write-Step  { param($num, $msg) Write-Host "[STEP $num] $msg" -ForegroundColor Cyan }
function Write-Info  { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Test-PythonVersion {
    try {
        $ver = & python --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 11) { return $true }
        }
    } catch {}
    return $false
}

function Resolve-LatestVersion {
    if ($Version) { return $Version }

    Write-Info "Fetching latest release version..."
    try {
        $manifest = Invoke-RestMethod -Uri "$CdnBaseUrl/hub/latest.json" -UseBasicParsing
        return $manifest.version
    } catch {
        Write-Err "Could not determine latest version. Use -Version parameter."
        exit 1
    }
}

# --- Banner ---
Write-Host ""
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host "|      Vitora HMIS - Facility Hub Installer         |" -ForegroundColor Cyan
Write-Host "|               Windows Edition                     |" -ForegroundColor Cyan
Write-Host "+==================================================+" -ForegroundColor Cyan
Write-Host ""

# --- Pre-checks ---
if (-not (Test-PythonVersion)) {
    Write-Err "Python 3.11+ is required. Install from https://python.org"
    exit 1
}
Write-Info "Python version OK"

# --- Resolve Version ---
$Version = Resolve-LatestVersion
$ArtifactName = "vitora-hub-${Version}.zip"
$DownloadUrl = "$CdnBaseUrl/hub/$ArtifactName"

Write-Info "Version: $Version"
Write-Info "Download: $DownloadUrl"
Write-Host ""

# --- Configuration (Interactive or Env Vars) ---
if ($NonInteractive) {
    $HubId = $env:HUB_ID
    $FacilityId = $env:HUB_FACILITY_ID
    $OrgId = $env:HUB_ORGANIZATION_ID
    $SyncUrl = if ($env:SYNC_URL) { $env:SYNC_URL } else { "https://api.vitora.digital/api/sync" }
    $EncryptionKey = $env:ENCRYPTION_KEY

    if (-not $HubId -or -not $FacilityId -or -not $OrgId -or -not $EncryptionKey) {
        Write-Err "Non-interactive mode requires: HUB_ID, HUB_FACILITY_ID, HUB_ORGANIZATION_ID, ENCRYPTION_KEY"
        exit 1
    }
} else {
    Write-Host "Enter the configuration values from your Vitora cloud admin panel."
    Write-Host "(Found at: Settings -> Facilities -> Hub Setup)" -ForegroundColor DarkGray
    Write-Host ""

    $HubId = Read-Host "  Hub ID (unique name for this hub, e.g. 'reception-hub-1')"
    $FacilityId = Read-Host "  Facility ID (from cloud admin)"
    $OrgId = Read-Host "  Organization ID (from cloud admin)"
    $SyncUrl = Read-Host "  Cloud Sync URL [https://api.vitora.digital/api/sync]"
    if (-not $SyncUrl) { $SyncUrl = "https://api.vitora.digital/api/sync" }
    $EncryptionKey = Read-Host "  Encryption Key (must match cloud)" -AsSecureString
    $EncryptionKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($EncryptionKey)
    )

    Write-Host ""
    Write-Info "Configuration summary:"
    Write-Host "  Hub ID:          $HubId"
    Write-Host "  Facility:        $FacilityId"
    Write-Host "  Organization:    $OrgId"
    Write-Host "  Cloud Sync URL:  $SyncUrl"
    Write-Host "  Port:            $HubPort"
    Write-Host "  Install Dir:     $InstallDir"
    Write-Host ""

    $confirm = Read-Host "Proceed with installation? [y/N]"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Info "Cancelled."
        exit 0
    }
}

# --- Create Directories ---
Write-Step 1 "Creating directories..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null

# --- Download Release Artifact ---
Write-Step 2 "Downloading Vitora Hub v${Version}..."
$tempArchive = "$env:TEMP\$ArtifactName"

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $tempArchive -UseBasicParsing
} catch {
    Write-Err "Failed to download release artifact."
    Write-Err "URL: $DownloadUrl"
    Write-Err "Check that version '$Version' is published at: $CdnBaseUrl/hub/latest.json"
    exit 1
}

# Extract zip
Write-Info "Extracting to $InstallDir..."
$tempExtract = "$env:TEMP\vitora-hub-extract"
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
Expand-Archive -Path $tempArchive -DestinationPath $tempExtract -Force

# Find the inner folder (e.g., vitora-hub-0.3.1/) and copy contents
$innerDir = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
if ($innerDir) {
    Get-ChildItem -Path $innerDir.FullName | ForEach-Object {
        $dest = Join-Path $InstallDir $_.Name
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Move-Item -Path $_.FullName -Destination $dest
    }
} else {
    # Flat zip — move all contents
    Get-ChildItem -Path $tempExtract | ForEach-Object {
        $dest = Join-Path $InstallDir $_.Name
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Move-Item -Path $_.FullName -Destination $dest
    }
}
Remove-Item -Path $tempArchive -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

# Verify extraction
if (-not (Test-Path "$InstallDir\manage.py")) {
    Write-Err "Extraction failed: manage.py not found in $InstallDir"
    exit 1
}
Write-Info "Extraction complete."

# --- Download NSSM ---
Write-Step 3 "Setting up service manager..."
$nssmExe = "$NssmDir\nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Info "Downloading NSSM..."
    $zipPath = "$env:TEMP\nssm.zip"
    $downloaded = $false
    foreach ($url in $NssmUrls) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
            $downloaded = $true
            break
        } catch {
            Write-Host "  [WARN] Mirror unavailable: $url" -ForegroundColor Yellow
        }
    }
    if (-not $downloaded) {
        Write-Err "All NSSM download mirrors failed. Check internet connection."
        exit 1
    }
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm_extract" -Force

    $extracted = Get-ChildItem -Path "$env:TEMP\nssm_extract" -Recurse -Filter "nssm.exe" |
        Where-Object { $_.DirectoryName -match "win64" } |
        Select-Object -First 1

    if (-not $extracted) {
        $extracted = Get-ChildItem -Path "$env:TEMP\nssm_extract" -Recurse -Filter "nssm.exe" |
            Select-Object -First 1
    }

    if (-not $extracted) {
        Write-Err "Could not find nssm.exe in downloaded archive."
        exit 1
    }

    Copy-Item -Path $extracted.FullName -Destination $nssmExe
    Remove-Item -Path $zipPath -Force
    Remove-Item -Path "$env:TEMP\nssm_extract" -Recurse -Force
    Write-Info "NSSM installed."
} else {
    Write-Info "NSSM already present."
}

# --- Python Environment ---
Write-Step 4 "Setting up Python environment..."
if (-not (Test-Path "$VenvDir\Scripts\python.exe")) {
    & python -m venv $VenvDir
}

$python = "$VenvDir\Scripts\python.exe"

Write-Info "Installing Python dependencies..."
# Use python -m pip (avoids "To modify pip, please run..." error on old pip)
& $python -m pip install --quiet --upgrade pip
if (Test-Path "$InstallDir\requirements-hub.txt") {
    & $python -m pip install --quiet -r "$InstallDir\requirements-hub.txt"
} elseif (Test-Path "$InstallDir\requirements.txt") {
    & $python -m pip install --quiet -r "$InstallDir\requirements.txt"
}
& $python -m pip install --quiet daphne whitenoise

# --- Generate Secret Key ---
$secretKey = & $python -c "import secrets; print(secrets.token_urlsafe(50))"

# --- Write Environment File ---
Write-Step 5 "Writing configuration..."
$envContent = @"
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$secretKey
ENCRYPTION_KEY=$EncryptionKey
HUB_ID=$HubId
HUB_FACILITY_ID=$FacilityId
HUB_ORGANIZATION_ID=$OrgId
HUB_PORT=$HubPort
HUB_DB_PATH=$DataDir\hub.sqlite3
HUB_LOG_FILE=$LogDir\hub.log
SYNC_SERVER_URL=$SyncUrl
ALLOWED_HOSTS=*
HUB_VERSION=$Version
"@

Set-Content -Path "$InstallDir\.env" -Value $envContent
# Write version file
Set-Content -Path "$InstallDir\VERSION" -Value $Version
Write-Info "Configuration saved."

# --- Set Environment Variables for Setup ---
$env:DJANGO_ENV = "hub"
$env:DJANGO_SETTINGS_MODULE = "hmis.settings"
$env:HUB_DB_PATH = "$DataDir\hub.sqlite3"
$env:HUB_ID = $HubId
$env:HUB_FACILITY_ID = $FacilityId
$env:HUB_ORGANIZATION_ID = $OrgId
$env:DJANGO_SECRET_KEY = $secretKey
$env:ENCRYPTION_KEY = $EncryptionKey

# --- Database Setup ---
Write-Step 6 "Initializing database..."
Push-Location $InstallDir
& $python manage.py migrate --no-input
& $python manage.py collectstatic --no-input --clear 2>$null
Pop-Location

# Create superuser (skip in non-interactive mode)
if (-not $NonInteractive) {
    Write-Info "Create an admin account for this hub:"
    Push-Location $InstallDir
    & $python manage.py createsuperuser
    Pop-Location
}

# --- Install Windows Service via NSSM ---
Write-Step 7 "Installing Windows service..."

# Remove existing service if present
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Warn "Service '$ServiceName' already exists. Removing..."
    & $nssmExe stop $ServiceName 2>$null
    & $nssmExe remove $ServiceName confirm
    Start-Sleep -Seconds 2
}

# Install service
$daphneExe = "$VenvDir\Scripts\daphne.exe"
$daphneArgs = "-b 0.0.0.0 -p $HubPort hmis.asgi:application"

& $nssmExe install $ServiceName $daphneExe $daphneArgs

# Configure service parameters
& $nssmExe set $ServiceName DisplayName $ServiceDisplayName
& $nssmExe set $ServiceName Description $ServiceDescription
& $nssmExe set $ServiceName AppDirectory $InstallDir
& $nssmExe set $ServiceName Start SERVICE_AUTO_START

# Environment variables for the service
$envVars = @(
    "DJANGO_ENV=hub",
    "DJANGO_SETTINGS_MODULE=hmis.settings",
    "DJANGO_SECRET_KEY=$secretKey",
    "ENCRYPTION_KEY=$EncryptionKey",
    "HUB_ID=$HubId",
    "HUB_FACILITY_ID=$FacilityId",
    "HUB_ORGANIZATION_ID=$OrgId",
    "HUB_DB_PATH=$DataDir\hub.sqlite3",
    "HUB_LOG_FILE=$LogDir\hub.log",
    "SYNC_SERVER_URL=$SyncUrl",
    "ALLOWED_HOSTS=*"
) -join "`n"
& $nssmExe set $ServiceName AppEnvironmentExtra $envVars

# Logging
& $nssmExe set $ServiceName AppStdout "$LogDir\hub-stdout.log"
& $nssmExe set $ServiceName AppStderr "$LogDir\hub-stderr.log"
& $nssmExe set $ServiceName AppStdoutCreationDisposition 4
& $nssmExe set $ServiceName AppStderrCreationDisposition 4
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateBytes 10485760

# Auto-restart on failure
& $nssmExe set $ServiceName AppExit Default Restart
& $nssmExe set $ServiceName AppRestartDelay 10000

# --- Start Service ---
Write-Info "Starting service..."
& $nssmExe start $ServiceName

Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Info "Service is running!"
} else {
    Write-Warn "Service may not have started. Check logs at $LogDir"
}

# --- Firewall Rule ---
Write-Info "Adding firewall rule for port $HubPort..."
$ruleName = "Vitora Hub (TCP $HubPort)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName `
        -Direction Inbound -Protocol TCP -LocalPort $HubPort `
        -Action Allow -Profile Private | Out-Null
    Write-Info "Firewall rule added (Private profile only)."
} else {
    Write-Info "Firewall rule already exists."
}

# --- Verify ---
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$hubStatus = if ($svc -and $svc.Status -eq "Running") { "running" } else { "failed" }

if ($hubStatus -eq "failed") {
    Write-Warn "Service may not have started. Check logs at $LogDir"
}

# --- Done ---
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.PrefixOrigin -eq "Dhcp" } |
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "+==================================================+" -ForegroundColor Green
Write-Host "|      Vitora Hub v${Version} installed!             |" -ForegroundColor Green
Write-Host "+==================================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  Status:    $hubStatus"
Write-Host "  Service:   Get-Service $ServiceName"
Write-Host "  Logs:      $LogDir\"
Write-Host "  Health:    http://localhost:${HubPort}/api/hub/health/"
Write-Host ""
Write-Host "  +---------------------------------------------------+"
Write-Host "  | LAN clients connect to:                            |"
if ($localIp) {
    Write-Host "  |   http://${localIp}:${HubPort}                      |"
}
Write-Host "  +---------------------------------------------------+"
Write-Host ""
Write-Host "  Desktop app setup:"
Write-Host "    1. Choose 'Facility Workstation' mode"
if ($localIp) {
    Write-Host "    2. Enter hub URL: http://${localIp}:${HubPort}"
}
Write-Host "    3. Or choose 'Facility Server (Hub)' if this is the only PC"
Write-Host ""
Write-Host "  Manage:"
Write-Host "    Restart-Service $ServiceName"
Write-Host "    Stop-Service $ServiceName"
Write-Host "    $nssmExe edit $ServiceName"
Write-Host ""
