# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<#
.SYNOPSIS
    Rotates the local Vitora Hub DPAPI-encrypted secret bundle.

.DESCRIPTION
    Reads candidate secret values from explicit script parameters first, then
    process environment variables, then C:\VitoraHub\.env, and finally the
    existing DPAPI bundle (to preserve keys not being changed). Writes an
    updated DPAPI secret bundle used by start-hub.ps1 at service startup.

.USAGE
    powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\rotate-hub-secrets.ps1 -RestartService
    powershell -ExecutionPolicy Bypass -File C:\VitoraHub\scripts\rotate-hub-secrets.ps1 -DjangoSecretKey "..." -EncryptionKey "..."

.ARGS
    -InstallDir          Hub install directory (default: C:\VitoraHub)
    -SecretsFile         Override bundle path (default: <InstallDir>\secrets\hub-secrets.dpapi.json)
    -DjangoSecretKey     Optional override for DJANGO_SECRET_KEY
    -EncryptionKey       Optional override for ENCRYPTION_KEY
    -PiiHmacKey          Optional override for PII_HMAC_KEY
    -LicenseToken        Optional override for LICENSE_TOKEN
    -TibaBotApiKey       Optional override for TIBABOT_API_KEY
    -TibaBotJwtPrivateKey Optional override for TIBABOT_JWT_PRIVATE_KEY
    -TibaBotJwtSecret    Optional override for TIBABOT_JWT_SECRET
    -TibaBotAdminKey     Optional override for TIBABOT_ADMIN_KEY
    -RestartService      Restart VitoraHub service after writing bundle
#>

#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\VitoraHub",
    [string]$SecretsFile = "",
    [string]$DjangoSecretKey = "",
    [string]$EncryptionKey = "",
    [string]$PiiHmacKey = "",
    [string]$LicenseToken = "",
    [string]$TibaBotApiKey = "",
    [string]$TibaBotJwtPrivateKey = "",
    [string]$TibaBotJwtSecret = "",
    [string]$TibaBotAdminKey = "",
    [switch]$RestartService
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info  { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn  { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Err   { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

function Mask-SecretValue {
    param([AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrEmpty($Value)) {
        return "(empty)"
    }

    if ($Value.Length -le 8) {
        return ("*" * $Value.Length)
    }

    return "{0}...{1}" -f $Value.Substring(0, 4), $Value.Substring($Value.Length - 4)
}

function Parse-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    $map = @{}
    if (-not (Test-Path $Path)) {
        return $map
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $name = $matches[1]
            $value = $matches[2].Trim().Trim('"').Trim("'")
            $map[$name] = $value
        }
    }

    return $map
}

function Get-JsonPropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }

    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) {
        return $null
    }

    return $prop.Value
}

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

function ConvertFrom-DpapiCiphertext {
    param([Parameter(Mandatory = $true)][string]$CiphertextB64)

    Initialize-DpapiType
    $cipherBytes = [Convert]::FromBase64String($CiphertextB64)
    $plainBytes = $script:DpapiProtectedDataType::Unprotect(
        $cipherBytes,
        $null,
        $script:DpapiLocalMachineScope
    )

    return [Text.Encoding]::UTF8.GetString($plainBytes)
}

function Read-ExistingSecretBundle {
    param([Parameter(Mandatory = $true)][string]$Path)

    $map = @{}
    if (-not (Test-Path $Path)) {
        return $map
    }

    try {
        $raw = (Get-Content $Path -Raw).Trim()
        if (-not $raw) {
            return $map
        }

        $payload = $null
        try {
            $payload = $raw | ConvertFrom-Json
        } catch {
            $payload = $null
        }

        $plainJson = ""
        $ciphertextB64 = Get-JsonPropertyValue -Object $payload -Name "ciphertext_b64"
        $payloadSecrets = Get-JsonPropertyValue -Object $payload -Name "secrets"

        if ($null -ne $payload -and $null -ne $ciphertextB64 -and "$ciphertextB64" -ne "") {
            $plainJson = ConvertFrom-DpapiCiphertext -CiphertextB64 $ciphertextB64
        } elseif ($null -ne $payload -and $null -ne $payloadSecrets) {
            $plainJson = $raw
        } else {
            $plainJson = ConvertFrom-DpapiCiphertext -CiphertextB64 $raw
        }

        $secretDoc = $plainJson | ConvertFrom-Json
        $secretDocSecrets = Get-JsonPropertyValue -Object $secretDoc -Name "secrets"
        $secretMap = if ($null -ne $secretDocSecrets) { $secretDocSecrets } else { $secretDoc }
        $secretMap.PSObject.Properties | ForEach-Object {
            $map[$_.Name] = [string]$_.Value
        }
    } catch {
        Write-Warn "Could not parse existing bundle at $Path ($($_.Exception.Message)); proceeding with fresh bundle."
    }

    return $map
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
        Write-Warn "DPAPI unavailable; wrote plaintext secret bundle fallback at $Path"
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

function Resolve-SecretValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$ExplicitValue,
        [Parameter(Mandatory = $true)][hashtable]$EnvMap,
        [Parameter(Mandatory = $true)][hashtable]$ExistingMap
    )

    if ($ExplicitValue) {
        return $ExplicitValue
    }

    $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ($processValue) {
        return $processValue
    }

    if ($EnvMap.ContainsKey($Name) -and $EnvMap[$Name]) {
        return $EnvMap[$Name]
    }

    if ($ExistingMap.ContainsKey($Name) -and $ExistingMap[$Name]) {
        return $ExistingMap[$Name]
    }

    return ""
}

try {
    if (-not $SecretsFile) {
        $SecretsFile = Join-Path $InstallDir "secrets\hub-secrets.dpapi.json"
    }

    $envFile = Join-Path $InstallDir ".env"
    $envMap = Parse-DotEnv -Path $envFile
    $existingMap = Read-ExistingSecretBundle -Path $SecretsFile

    $secrets = @{
        DJANGO_SECRET_KEY = Resolve-SecretValue -Name "DJANGO_SECRET_KEY" -ExplicitValue $DjangoSecretKey -EnvMap $envMap -ExistingMap $existingMap
        ENCRYPTION_KEY = Resolve-SecretValue -Name "ENCRYPTION_KEY" -ExplicitValue $EncryptionKey -EnvMap $envMap -ExistingMap $existingMap
        PII_HMAC_KEY = Resolve-SecretValue -Name "PII_HMAC_KEY" -ExplicitValue $PiiHmacKey -EnvMap $envMap -ExistingMap $existingMap
        LICENSE_TOKEN = Resolve-SecretValue -Name "LICENSE_TOKEN" -ExplicitValue $LicenseToken -EnvMap $envMap -ExistingMap $existingMap
        TIBABOT_API_KEY = Resolve-SecretValue -Name "TIBABOT_API_KEY" -ExplicitValue $TibaBotApiKey -EnvMap $envMap -ExistingMap $existingMap
        TIBABOT_JWT_PRIVATE_KEY = Resolve-SecretValue -Name "TIBABOT_JWT_PRIVATE_KEY" -ExplicitValue $TibaBotJwtPrivateKey -EnvMap $envMap -ExistingMap $existingMap
        TIBABOT_JWT_SECRET = Resolve-SecretValue -Name "TIBABOT_JWT_SECRET" -ExplicitValue $TibaBotJwtSecret -EnvMap $envMap -ExistingMap $existingMap
        TIBABOT_ADMIN_KEY = Resolve-SecretValue -Name "TIBABOT_ADMIN_KEY" -ExplicitValue $TibaBotAdminKey -EnvMap $envMap -ExistingMap $existingMap
    }

    $missing = @($secrets.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
    if ($missing.Count -gt 0) {
        Write-Warn "Some secret values are empty and will remain empty: $($missing -join ', ')"
    }

    Write-DpapiSecretsBundle -Secrets $secrets -Path $SecretsFile
    Write-Ok "DPAPI secret bundle written to $SecretsFile"

    $secrets.GetEnumerator() | Sort-Object Name | ForEach-Object {
        Write-Info ("{0} = {1}" -f $_.Key, (Mask-SecretValue -Value $_.Value))
    }

    if ($RestartService) {
        $serviceName = "VitoraHub"
        Write-Info "Restarting $serviceName service..."
        Restart-Service -Name $serviceName -Force
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name $serviceName -ErrorAction Stop
        Write-Ok "Service status: $($svc.Status)"
    }
} catch {
    Write-Err "Secret rotation failed: $($_.Exception.Message)"
    throw
}
