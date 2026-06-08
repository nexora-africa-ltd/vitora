# ============================================================================
# Vitora HMIS — Facility Hub Windows Installer
#
# Installs and configures the Django backend as a local facility hub
# running as a Windows service via NSSM (Non-Sucking Service Manager).
#
# Usage (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File scripts\install-hub-windows.ps1
#
# Prerequisites:
#   - Windows 10/11 or Windows Server 2019+
#   - Python 3.11+ installed and on PATH
#   - Administrator privileges
# ============================================================================

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

# --- Configuration ---
$AppName = "VitoraHub"
$ServiceName = "VitoraHub"
$ServiceDisplayName = "Vitora HMIS Facility Hub"
$ServiceDescription = "Local facility hub for Vitora HMIS offline-first sync"
$InstallDir = "C:\VitoraHub"
$VenvDir = "$InstallDir\venv"
$DataDir = "$InstallDir\data"
$LogDir = "$InstallDir\logs"
$HubPort = if ($env:HUB_PORT) { $env:HUB_PORT } else { "9088" }
$NssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
$NssmDir = "$InstallDir\nssm"

# --- Helper Functions ---
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

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

# --- Pre-checks ---
Write-Host ""
Write-Host "=== Vitora HMIS - Facility Hub Windows Installer ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-PythonVersion)) {
    Write-Err "Python 3.11+ is required. Install from https://python.org"
    exit 1
}
Write-Info "Python version OK"

# --- Interactive Setup ---
$HubId = Read-Host "Enter Hub ID (unique identifier for this hub)"
$FacilityId = Read-Host "Enter Facility ID (from cloud admin)"
$OrgId = Read-Host "Enter Organization ID (from cloud admin)"
$SyncUrl = Read-Host "Enter Cloud Sync URL [https://api.vitora.digital/api/sync]"
if (-not $SyncUrl) { $SyncUrl = "https://api.vitora.digital/api/sync" }
$EncryptionKey = Read-Host "Enter Encryption Key (must match cloud)"

Write-Host ""
Write-Info "Configuration:"
Write-Host "  Hub ID:          $HubId"
Write-Host "  Facility:        $FacilityId"
Write-Host "  Organization:    $OrgId"
Write-Host "  Cloud Sync URL:  $SyncUrl"
Write-Host "  Port:            $HubPort"
Write-Host "  Install Dir:     $InstallDir"
Write-Host ""

$confirm = Read-Host "Proceed? [y/N]"
if ($confirm -notmatch "^[Yy]$") {
    Write-Info "Cancelled."
    exit 0
}

# --- Create Directories ---
Write-Info "Creating directories..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null

# --- Download NSSM ---
$nssmExe = "$NssmDir\nssm.exe"
if (-not (Test-Path $nssmExe)) {
    Write-Info "Downloading NSSM..."
    $zipPath = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri $NssmUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm_extract" -Force

    # Find the 64-bit exe
    $extracted = Get-ChildItem -Path "$env:TEMP\nssm_extract" -Recurse -Filter "nssm.exe" |
        Where-Object { $_.DirectoryName -match "win64" } |
        Select-Object -First 1

    if (-not $extracted) {
        # Fall back to any nssm.exe
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
    Write-Info "NSSM installed to $nssmExe"
} else {
    Write-Info "NSSM already present."
}

# --- Copy Application Code ---
Write-Info "Copying application code..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Split-Path -Parent $scriptDir

if (Test-Path "$backendDir\hmis") {
    # Copy backend code (exclude venv, __pycache__, .git)
    robocopy $backendDir $InstallDir /E /XD venv __pycache__ .git htmlcov .pytest_cache node_modules /XF "*.pyc" db.sqlite3 hub.sqlite3 /NFL /NDL /NJH /NJS | Out-Null
    Write-Info "Application code copied."
} else {
    Write-Warn "Backend code not found at $backendDir. Assuming code is already in $InstallDir."
}

# --- Create Virtual Environment ---
Write-Info "Creating Python virtual environment..."
if (-not (Test-Path "$VenvDir\Scripts\python.exe")) {
    & python -m venv $VenvDir
}

$pip = "$VenvDir\Scripts\pip.exe"
$python = "$VenvDir\Scripts\python.exe"

Write-Info "Installing Python dependencies..."
& $pip install --quiet --upgrade pip
if (Test-Path "$InstallDir\requirements.txt") {
    & $pip install --quiet -r "$InstallDir\requirements.txt"
}
& $pip install --quiet daphne whitenoise

# --- Generate Secret Key ---
$secretKey = & $python -c "import secrets; print(secrets.token_urlsafe(50))"

# --- Write Environment File ---
Write-Info "Writing environment configuration..."
$envContent = @"
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$secretKey
ENCRYPTION_KEY=$EncryptionKey
HUB_ID=$HubId
HUB_FACILITY_ID=$FacilityId
HUB_ORGANIZATION_ID=$OrgId
HUB_DB_PATH=$DataDir\hub.sqlite3
HUB_LOG_FILE=$LogDir\hub.log
SYNC_SERVER_URL=$SyncUrl
ALLOWED_HOSTS=*
"@

Set-Content -Path "$InstallDir\.env" -Value $envContent
Write-Info "Environment file written."

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
Write-Info "Running database migrations..."
Push-Location $InstallDir
& $python manage.py migrate --no-input
& $python manage.py collectstatic --no-input --clear 2>$null
Pop-Location

Write-Info "Creating admin user..."
Push-Location $InstallDir
& $python manage.py createsuperuser
Pop-Location

# --- Install Windows Service via NSSM ---
Write-Info "Installing Windows service..."

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

# --- Done ---
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Info "Vitora Hub installed successfully!"
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Service:   Get-Service $ServiceName"
Write-Host "  Logs:      $LogDir\"
Write-Host "  Health:    http://localhost:${HubPort}/api/hub/health/"
Write-Host "  Admin:     http://localhost:${HubPort}/admin/"
Write-Host ""

$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.PrefixOrigin -eq "Dhcp" } |
    Select-Object -First 1).IPAddress

if ($localIp) {
    Write-Host "  LAN clients connect to: http://${localIp}:${HubPort}"
}

Write-Host ""
Write-Host "  Manage:"
Write-Host "    Restart-Service $ServiceName"
Write-Host "    Stop-Service $ServiceName"
Write-Host "    $nssmExe edit $ServiceName"
Write-Host ""
