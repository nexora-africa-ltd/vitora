# ============================================================================
# Vitora HMIS -- Facility Hub Windows Installer
#
# Installs and configures the Django backend as a local facility hub
# running as a Windows service via NSSM (Non-Sucking Service Manager).
#
# Downloads a pre-built release artifact from Azure CDN -- no repo clone needed.
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
#   - Python 3.12 installed and on PATH (exact version, not 3.11 or 3.13)
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

function Resolve-ConfigValue {
    param(
        [Parameter(Mandatory=$true)][string]$EnvName,
        $ActivationValue,
        [string]$Default = ""
    )
    if ($null -ne $ActivationValue -and "$ActivationValue" -ne "") {
        $text = "$ActivationValue"
        if ($text -eq "True" -or $text -eq "False") { return $text.ToLowerInvariant() }
        return $text
    }
    $envValue = [System.Environment]::GetEnvironmentVariable($EnvName)
    if ($envValue) { return $envValue }
    return $Default
}

function Test-PythonVersion {
    # We require EXACTLY Python 3.12 because the hub ships pre-compiled .pyd
    # files tagged for the cp312 ABI. Other Python minor versions silently
    # cannot load them, causing 'cannot import name' errors at startup.
    try {
        $ver = & python --version 2>&1
        if ($ver -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -eq 3 -and $minor -eq 12) { return $true }
            Write-Err "Found Python $major.$minor, but Python 3.12 is required."
            Write-Err "The hub binaries are compiled for Python 3.12 only."
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
    Write-Err "Python 3.12 is required (exact version - not 3.11, 3.13, etc.)."
    Write-Err "Download Python 3.12: https://www.python.org/downloads/release/python-31210/"
    Write-Err "During install, check 'Add python.exe to PATH'."
    exit 1
}
Write-Info "Python 3.12 OK"

# --- Resolve Version ---
$Version = Resolve-LatestVersion
$ArtifactName = "vitora-hub-${Version}.zip"
$DownloadUrl = "$CdnBaseUrl/hub/$ArtifactName"

Write-Info "Version: $Version"
Write-Info "Download: $DownloadUrl"
Write-Host ""

# --- Configuration (Activation-Driven) ---
$CloudUrl = if ($env:CLOUD_URL) { $env:CLOUD_URL } else { "https://api.vitora.digital" }

if ($NonInteractive) {
    $ActivationCode = $env:ACTIVATION_CODE
    if (-not $ActivationCode) {
        Write-Err "Non-interactive mode requires: ACTIVATION_CODE environment variable"
        exit 1
    }
    if ($env:CLOUD_URL) { $CloudUrl = $env:CLOUD_URL }
} else {
    Write-Host "This installer will activate a hub by connecting to the Vitora cloud."
    Write-Host "You need an activation code from your cloud admin panel."
    Write-Host "(Found at: Settings -> Facilities -> Hub Setup -> Generate Code)" -ForegroundColor DarkGray
    Write-Host ""

    $ActivationCode = Read-Host "  Activation Code"
    $cloudInput = Read-Host "  Cloud URL [https://api.vitora.digital]"
    if ($cloudInput) { $CloudUrl = $cloudInput }

    Write-Host ""
    $confirm = Read-Host "Proceed with activation and installation? [y/N]"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Info "Cancelled."
        exit 0
    }
}

# --- Activate with Cloud ---
Write-Step "A" "Activating hub with cloud..."
$InstallationId = "hub-$($env:COMPUTERNAME)-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

try {
    $activationBody = @{
        activation_code = $ActivationCode
        installation_id = $InstallationId
    } | ConvertTo-Json

    $activationResponse = Invoke-RestMethod -Uri "$CloudUrl/api/licensing/activate/" `
        -Method POST -Body $activationBody -ContentType "application/json" -UseBasicParsing
} catch {
    Write-Err "Activation failed. Check your activation code and internet connection."
    Write-Err "Cloud URL: $CloudUrl/api/licensing/activate/"
    Write-Err "Error: $_"
    exit 1
}

# Parse activation response
$LicenseToken = $activationResponse.license_token
$HubId = $InstallationId
$OrgId = $activationResponse.organization.id
$FacilityId = $activationResponse.facility.id
$SyncUrl = if ($activationResponse.sync_url) { $activationResponse.sync_url } else { "$CloudUrl/api/sync" }
$OrgName = $activationResponse.organization.name
$FacilityName = $activationResponse.facility.name
$EncryptionKey = if ($activationResponse.encryption_key) { $activationResponse.encryption_key } else { "" }
$PiiHmacKey = if ($activationResponse.pii_hmac_key) { $activationResponse.pii_hmac_key } else { "" }
$TibaBotConfig = $activationResponse.tibabot
$TibaBotEnabled = Resolve-ConfigValue "TIBABOT_ENABLED" $TibaBotConfig.enabled "true"
$TibaBotApiUrl = Resolve-ConfigValue "TIBABOT_API_URL" $TibaBotConfig.api_url ""
$TibaBotApiKey = Resolve-ConfigValue "TIBABOT_API_KEY" $TibaBotConfig.api_key ""
$TibaBotTimeout = Resolve-ConfigValue "TIBABOT_TIMEOUT" $TibaBotConfig.timeout "30"
$TibaBotJwtPrivateKey = Resolve-ConfigValue "TIBABOT_JWT_PRIVATE_KEY" $TibaBotConfig.jwt_private_key ""
$TibaBotJwtSecret = Resolve-ConfigValue "TIBABOT_JWT_SECRET" $TibaBotConfig.jwt_secret ""
$TibaBotJwtIssuer = Resolve-ConfigValue "TIBABOT_JWT_ISSUER" $TibaBotConfig.jwt_issuer "vitora-hmis"
$TibaBotJwtAudience = Resolve-ConfigValue "TIBABOT_JWT_AUDIENCE" $TibaBotConfig.jwt_audience "tibabot"
$TibaBotJwtExpirySeconds = Resolve-ConfigValue "TIBABOT_JWT_EXPIRY_SECONDS" $TibaBotConfig.jwt_expiry_seconds "300"
$TibaBotJwksUrl = Resolve-ConfigValue "TIBABOT_JWKS_URL" $TibaBotConfig.jwks_url ""
$TibaBotAdminKey = Resolve-ConfigValue "TIBABOT_ADMIN_KEY" $TibaBotConfig.admin_key ""
$HubCloudAuthEnabled = Resolve-ConfigValue "HUB_CLOUD_AUTH_ENABLED" $activationResponse.hub_cloud_auth_enabled "true"
$HubCloudAuthUrl = Resolve-ConfigValue "HUB_CLOUD_AUTH_URL" $activationResponse.hub_cloud_auth_url "$CloudUrl/api/auth/login/"

# WebAuthn defaults to localhost-scoped values because that is the only
# combination that works without TLS. Hubs reached over LAN by hostname/IP
# must override these via -env or by configuring the cloud facility settings.
$WebauthnRpId = Resolve-ConfigValue "WEBAUTHN_RP_ID" $activationResponse.webauthn_rp_id "localhost"
$WebauthnOrigin = Resolve-ConfigValue "WEBAUTHN_ORIGIN" $activationResponse.webauthn_origin "http://localhost:$HubPort"

Write-Info "Activation successful!"
Write-Host ""
Write-Host "  Organization:  $OrgName (ID: $OrgId)"
Write-Host "  Facility:      $FacilityName (ID: $FacilityId)"
Write-Host "  Hub ID:        $HubId"
Write-Host "  Sync URL:      $SyncUrl"
Write-Host ""

# Save activation response for seeding
$activationFile = "$env:TEMP\vitora-activation.json"
$activationResponse | ConvertTo-Json -Depth 10 | Set-Content -Path $activationFile

# --- Stop existing service (if upgrading) ---
# When re-running the installer, the VitoraHub Windows service loads .pyd
# files into memory via Daphne. Those files cannot be deleted while loaded,
# causing "Access to the path is denied" during extraction. Stop the service
# first and wait for it to fully release its file handles.
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    if ($existingService.Status -ne 'Stopped') {
        Write-Info "Stopping existing $ServiceName service (this may take a few seconds)..."
        try {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            # Wait up to 30s for the service to fully stop and release handles
            $waited = 0
            while ((Get-Service -Name $ServiceName).Status -ne 'Stopped' -and $waited -lt 30) {
                Start-Sleep -Seconds 1
                $waited++
            }
            # Give the OS another moment to flush file handles after the
            # service reports stopped (daphne/python child processes may
            # linger briefly).
            Start-Sleep -Seconds 2
        } catch {
            Write-Warn "Could not stop $ServiceName service automatically: $_"
            Write-Warn "If extraction fails, stop the service manually with: sc.exe stop $ServiceName"
        }
    }
    # Also kill any orphaned python.exe processes that might still hold .pyd
    # files (in case the service was killed but children survived).
    Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object {
        Write-Info "Terminating orphaned hub python process (PID $($_.Id))..."
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
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

# Helper: remove a path with retries to handle transient file locks
# (Windows AV scanners, lingering python child processes, etc.)
function Remove-PathWithRetry {
    param([string]$Path, [int]$MaxAttempts = 5)
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        try {
            Remove-Item -Recurse -Force -Path $Path -ErrorAction Stop
            return
        } catch {
            if ($i -eq $MaxAttempts) {
                Write-Err "Failed to remove $Path after $MaxAttempts attempts."
                Write-Err "Likely cause: a file is locked by a running process."
                Write-Err "Stop the $ServiceName service and any python.exe processes under $InstallDir, then retry."
                throw
            }
            Start-Sleep -Milliseconds (500 * $i)
        }
    }
}

function Remove-NestedPackagedDataCopy {
    $nestedData = Join-Path $InstallDir "data\data"
    if (-not (Test-Path $nestedData)) { return }

    if (Test-Path (Join-Path $nestedData "hub.sqlite3")) {
        Write-Warn "Nested data directory contains hub.sqlite3; leaving it untouched for manual review: $nestedData"
        return
    }

    Write-Info "Removing nested packaged data directory: $nestedData"
    Remove-PathWithRetry -Path $nestedData
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
            return
        }
        if ($_.Name -in @('hub.sqlite3', 'hub.sqlite3-wal', 'hub.sqlite3-shm')) {
            Write-Info "Preserving runtime database file: $($_.Name)"
            return
        }
        if ($_.PSIsContainer) {
            Merge-DirectoryPreservingRuntimeData -SourceDir $_.FullName -DestinationDir $target
        } else {
            Copy-Item -Path $_.FullName -Destination $target -Force
        }
    }
}

function Install-ExtractedHubItem {
    param(
        [Parameter(Mandatory=$true)]$SourceItem,
        [Parameter(Mandatory=$true)][string]$DestinationRoot
    )

    $dest = Join-Path $DestinationRoot $SourceItem.Name
    if ($SourceItem.Name -eq 'data') {
        Write-Info "Merging packaged reference data without deleting runtime data..."
        Merge-DirectoryPreservingRuntimeData -SourceDir $SourceItem.FullName -DestinationDir $dest
        return
    }

    if (Test-Path $dest) { Remove-PathWithRetry -Path $dest }
    Move-Item -Path $SourceItem.FullName -Destination $dest
}

# Find the inner folder (e.g., vitora-hub-0.3.1/) and copy contents
$innerDir = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
if ($innerDir) {
    Get-ChildItem -Path $innerDir.FullName | ForEach-Object {
        Install-ExtractedHubItem -SourceItem $_ -DestinationRoot $InstallDir
    }
} else {
    # Flat zip -- move all contents
    Get-ChildItem -Path $tempExtract | ForEach-Object {
        Install-ExtractedHubItem -SourceItem $_ -DestinationRoot $InstallDir
    }
}
Remove-Item -Path $tempArchive -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
Remove-NestedPackagedDataCopy

# Verify extraction
if (-not (Test-Path "$InstallDir\manage.py")) {
    Write-Err "Extraction failed: manage.py not found in $InstallDir"
    exit 1
}
Write-Info "Extraction complete."

# Harden directory permissions: Administrators have full control,
# SYSTEM has full control, authenticated users have read+execute only.
# This prevents casual modification by non-admin users.
Write-Info "Hardening directory permissions..."
try {
    $acl = Get-Acl $InstallDir
    $acl.SetAccessRuleProtection($true, $false)  # Disable inheritance
    # Remove all existing rules
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) } | Out-Null
    # Administrators: Full Control
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($adminRule)
    # SYSTEM: Full Control (needed for service)
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($systemRule)
    # Users: Read & Execute only (no modify/write)
    $userRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "BUILTIN\Users", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($userRule)
    Set-Acl $InstallDir $acl
    Write-Info "ACLs set: Admins=FullControl, Users=ReadOnly"
} catch {
    Write-Warn "Could not set restrictive ACLs: $_"
}

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

# If a venv already exists from a previous install, verify its interpreter
# actually IS Python 3.12 -- not just whatever `python` was at the time it was
# created. A 3.11 venv silently fails to load .cp312-win_amd64.pyd modules
# with "DLL load failed".
if (Test-Path "$VenvDir\Scripts\python.exe") {
    $venvVersion = & "$VenvDir\Scripts\python.exe" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
    if ($venvVersion -ne "3.12") {
        Write-Warn "Existing venv uses Python $venvVersion, but Vitora Hub requires 3.12. Rebuilding venv..."
        Remove-Item -Recurse -Force $VenvDir
    } else {
        Write-Info "Existing venv is Python 3.12. Reusing."
    }
}

if (-not (Test-Path "$VenvDir\Scripts\python.exe")) {
    & python -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to create venv. Check that Python 3.12 is installed and on PATH."
        exit 1
    }
}

$python = "$VenvDir\Scripts\python.exe"

# Belt-and-suspenders: confirm the venv we're about to use is really 3.12.
$venvVersionCheck = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
if ($venvVersionCheck -ne "3.12") {
    Write-Err "venv interpreter is Python $venvVersionCheck, expected 3.12. Aborting to avoid ABI mismatch."
    Write-Err "Compiled .pyd modules are tagged cp312 and will fail to import on any other version."
    exit 1
}

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
if (-not $PiiHmacKey) {
    Write-Warn "Activation response did not include pii_hmac_key; generating a local fallback. Cross-system PII exact-match lookup may differ."
    $PiiHmacKey = & $python -c "import secrets; print(secrets.token_urlsafe(32))"
}

# --- Write Environment File ---
Write-Step 5 "Writing configuration..."
$envContent = @"
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$secretKey
ENCRYPTION_KEY=$EncryptionKey
PII_HMAC_KEY=$PiiHmacKey
HUB_ID=$HubId
HUB_FACILITY_ID=$FacilityId
HUB_ORGANIZATION_ID=$OrgId
HUB_PORT=$HubPort
HUB_DB_PATH=$DataDir\hub.sqlite3
HUB_DATA_DIR=$DataDir
HUB_LOG_FILE=$LogDir\hub.log
SYNC_SERVER_URL=$SyncUrl
LICENSE_TOKEN=$LicenseToken
ALLOWED_HOSTS=*
HUB_VERSION=$Version
HUB_CLOUD_AUTH_ENABLED=$HubCloudAuthEnabled
HUB_CLOUD_AUTH_URL=$HubCloudAuthUrl
TIBABOT_ENABLED=$TibaBotEnabled
TIBABOT_API_URL=$TibaBotApiUrl
TIBABOT_API_KEY=$TibaBotApiKey
TIBABOT_TIMEOUT=$TibaBotTimeout
TIBABOT_JWT_PRIVATE_KEY=$TibaBotJwtPrivateKey
TIBABOT_JWT_SECRET=$TibaBotJwtSecret
TIBABOT_JWT_ISSUER=$TibaBotJwtIssuer
TIBABOT_JWT_AUDIENCE=$TibaBotJwtAudience
TIBABOT_JWT_EXPIRY_SECONDS=$TibaBotJwtExpirySeconds
TIBABOT_JWKS_URL=$TibaBotJwksUrl
TIBABOT_ADMIN_KEY=$TibaBotAdminKey
WEBAUTHN_RP_ID=$WebauthnRpId
WEBAUTHN_ORIGIN=$WebauthnOrigin
"@

Set-Content -Path "$InstallDir\.env" -Value $envContent
# Write version file
Set-Content -Path "$InstallDir\VERSION" -Value $Version
Write-Info "Configuration saved."

# --- Hub Shell Wrapper ---
# Convenience script that loads .env and invokes any manage.py command
# (defaults to `shell`). Lets admins run Django commands without having to
# manually export environment variables every time.
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
Write-Info "Hub management wrapper installed at $InstallDir\hub-shell.ps1"

# --- Set Environment Variables for Setup ---
$env:DJANGO_ENV = "hub"
$env:DJANGO_SETTINGS_MODULE = "hmis.settings"
$env:HUB_DB_PATH = "$DataDir\hub.sqlite3"
$env:HUB_DATA_DIR = "$DataDir"
$env:HUB_ID = $HubId
$env:HUB_FACILITY_ID = $FacilityId
$env:HUB_ORGANIZATION_ID = $OrgId
$env:DJANGO_SECRET_KEY = $secretKey
$env:ENCRYPTION_KEY = $EncryptionKey

# --- Database Setup ---
Write-Step 6 "Initializing database..."
Push-Location $InstallDir

# Native Python commands may emit warnings on stderr (e.g. python-magic).
# Under $ErrorActionPreference = 'Stop' that raises NativeCommandError.
# Relax to 'Continue' for the whole management-command block; we check
# $LASTEXITCODE after each call instead.
$prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'

# Smart migration: query the DB directly for unapplied migrations so we can
# skip the migrate step entirely on hot reinstalls. When migrations ARE
# pending, run a single `manage.py migrate` invocation (not one per app) --
# Django rebuilds the full graph on every startup, so per-app loops just
# multiply that overhead. Output is streamed live with --verbosity 2 so the
# user sees "Applying foo.0001_initial... OK" instead of staring at a blank
# screen for 20+ min.
$dbPath = "$DataDir\hub.sqlite3"
$appsToMigrate = @()
if (Test-Path $dbPath) {
    $appsToMigrate = (& $python -c "
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
}

if ($null -eq $appsToMigrate -or $appsToMigrate.Count -eq 0) {
    if (Test-Path $dbPath) {
        Write-Info "All migrations already applied -- skipping migrate."
    } else {
        # Fresh install -- run full migrate with streaming output
        Write-Info "Fresh install -- running full migration..."
        & $python manage.py migrate --no-input --verbosity 2 2>&1 |
            ForEach-Object { Write-Host "  $_" }
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "migrate failed (exit $LASTEXITCODE)"
        }
    }
} else {
    Write-Info "$($appsToMigrate.Count) app(s) need migration: $($appsToMigrate -join ', ')"
    Write-Info "Running migrations (streaming progress)..."
    & $python manage.py migrate --no-input --verbosity 2 2>&1 |
        ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "migrate failed (exit $LASTEXITCODE)"
    }
}

# Load Kenya location data (counties, sub-counties, wards)
if (Test-Path "$InstallDir\data\kenya_locations.csv") {
    Write-Info "Loading Kenya location data..."
    & $python manage.py import_kenya_locations "data\kenya_locations.csv"
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "import_kenya_locations failed (exit $LASTEXITCODE)"
    }
}

# Initialize all production reference data (subscription plans, RBAC roles,
# ICD-10, LOINC, drugs, CDS rules, KEPI schedule, notifiable diseases, etc).
# Idempotent -- safe to re-run on upgrade.
Write-Info "Initializing reference data (this may take a few minutes)..."
& $python manage.py initialize_hub
if ($LASTEXITCODE -ne 0) {
    Write-Warn "initialize_hub completed with errors (exit $LASTEXITCODE). Some reference data may be missing."
}

# Seed org/facility from activation data
Write-Info "Seeding organization and facility from activation data..."
& $python manage.py seed_from_activation --response-file="$activationFile" --skip-locations
if ($LASTEXITCODE -ne 0) {
    Write-Warn "seed_from_activation failed (exit $LASTEXITCODE)"
}
Remove-Item -Path $activationFile -Force -ErrorAction SilentlyContinue

# Collect static files (Django admin CSS, etc.).  Don't swallow errors --
# if this fails the admin page will be unstyled.
& $python manage.py collectstatic --no-input --clear
if ($LASTEXITCODE -ne 0) {
    Write-Warn "collectstatic failed (exit $LASTEXITCODE). Django admin will be unstyled until this is resolved."
}
$ErrorActionPreference = $prevEAP
Pop-Location

# Create superuser (skip in non-interactive mode)
if (-not $NonInteractive) {
    # Check if cloud already has admin accounts (manifest written by seed_from_activation)
    $cloudManifest = "$DataDir\cloud_users.json"
    $skipSuperuser = $false
    if (Test-Path $cloudManifest) {
        $cloudUsers = Get-Content $cloudManifest -Raw | ConvertFrom-Json
        $cloudAdmins = @($cloudUsers | Where-Object {
            $_.is_superuser -eq $true -or $_.role_code -in @("ADMIN", "ORG-ADMIN", "OWNER")
        })
        if ($cloudAdmins.Count -gt 0) {
            $adminNames = ($cloudAdmins | ForEach-Object { $_.username }) -join ", "
            Write-Host ""
            Write-Host "  Cloud already has admin account(s): $adminNames" -ForegroundColor Yellow
            Write-Host "  Activation reserves these usernames locally, but passwords are not included." -ForegroundColor Gray
            Write-Host "  Cloud credentials only work here after credential sync reaches the hub." -ForegroundColor Gray
            Write-Host ""
            $choice = Read-Host "  Create a local admin anyway? [y/N]"
            if ($choice -notmatch "^[Yy]$") {
                $skipSuperuser = $true
                Write-Info "Skipped local superuser creation. Use cloud credentials only after sync materializes credentials on this hub."
            }
        }
    }

    if (-not $skipSuperuser) {
        Write-Info "Create an admin account for this hub:"
        $defaultAdminUsername = if ($cloudAdmins -and $cloudAdmins.Count -gt 0) { "hub_admin" } else { "admin" }
        $localAdminUsername = Read-Host "  Local admin username [$defaultAdminUsername]"
        if (-not $localAdminUsername) { $localAdminUsername = $defaultAdminUsername }
        $defaultAdminEmail = "$localAdminUsername@vitora.local"
        $localAdminEmail = Read-Host "  Local admin email [$defaultAdminEmail]"
        if (-not $localAdminEmail) { $localAdminEmail = $defaultAdminEmail }
        Push-Location $InstallDir
        $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        # Use our custom create_superuser (underscore) -- it creates a StaffProfile
        # linked to the hub's organization/facility and honours HUB_USER_PK_OFFSET.
        # Django's built-in createsuperuser does neither.
        & $python manage.py create_superuser --username=$localAdminUsername --email=$localAdminEmail --force --reset-password
        $ErrorActionPreference = $prevEAP
        Pop-Location
    }
}

# --- Install Windows Service via NSSM ---
Write-Step 7 "Installing Windows service..."

# Remove existing service if present
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Warn "Service '$ServiceName' already exists. Removing..."
    # nssm.exe writes to stderr and returns non-zero when the service is
    # already stopped. With $ErrorActionPreference = "Stop", PowerShell would
    # convert that stderr into a terminating error. Merge stderr into stdout
    # and discard, then ignore the exit code via $LASTEXITCODE.
    if ($existingService.Status -eq 'Running') {
        & $nssmExe stop $ServiceName 2>&1 | Out-Null
    }
    $global:LASTEXITCODE = 0
    & $nssmExe remove $ServiceName confirm 2>&1 | Out-Null
    $global:LASTEXITCODE = 0
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
    "PII_HMAC_KEY=$PiiHmacKey",
    "HUB_ID=$HubId",
    "HUB_FACILITY_ID=$FacilityId",
    "HUB_ORGANIZATION_ID=$OrgId",
    "HUB_DB_PATH=$DataDir\hub.sqlite3",
    "HUB_DATA_DIR=$DataDir",
    "HUB_LOG_FILE=$LogDir\hub.log",
    "SYNC_SERVER_URL=$SyncUrl",
    "LICENSE_TOKEN=$LicenseToken",
    "ALLOWED_HOSTS=*",
    "WEBAUTHN_RP_ID=$WebauthnRpId",
    "WEBAUTHN_ORIGIN=$WebauthnOrigin",
    "HUB_CLOUD_AUTH_ENABLED=$HubCloudAuthEnabled",
    "HUB_CLOUD_AUTH_URL=$HubCloudAuthUrl",
    "TIBABOT_ENABLED=$TibaBotEnabled",
    "TIBABOT_API_URL=$TibaBotApiUrl",
    "TIBABOT_API_KEY=$TibaBotApiKey",
    "TIBABOT_TIMEOUT=$TibaBotTimeout",
    "TIBABOT_JWT_PRIVATE_KEY=$TibaBotJwtPrivateKey",
    "TIBABOT_JWT_SECRET=$TibaBotJwtSecret",
    "TIBABOT_JWT_ISSUER=$TibaBotJwtIssuer",
    "TIBABOT_JWT_AUDIENCE=$TibaBotJwtAudience",
    "TIBABOT_JWT_EXPIRY_SECONDS=$TibaBotJwtExpirySeconds",
    "TIBABOT_JWKS_URL=$TibaBotJwksUrl",
    "TIBABOT_ADMIN_KEY=$TibaBotAdminKey"
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
Write-Host "  Django shell / commands (loads .env automatically):"
Write-Host "    $InstallDir\hub-shell.ps1                       # Open Django shell"
Write-Host "    $InstallDir\hub-shell.ps1 create_superuser --force  # Create a hub-local superuser"
Write-Host "    $InstallDir\hub-shell.ps1 changepassword admin  # Reset a password"
Write-Host ""
