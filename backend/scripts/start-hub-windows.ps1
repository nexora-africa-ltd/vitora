# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<#
.SYNOPSIS
    Vitora Hub NSSM launcher for Windows.

.DESCRIPTION
    Loads hub runtime configuration from .env, then overlays secrets from a
    DPAPI-encrypted secret bundle, and finally starts Daphne.

    This script is intended to be the NSSM entrypoint so secrets are read at
    service start time instead of being persisted in NSSM AppEnvironmentExtra.

.USAGE
    powershell -NoProfile -ExecutionPolicy Bypass -File C:\VitoraHub\start-hub.ps1

.INPUTS
    Environment variables from C:\VitoraHub\.env and optional
    C:\VitoraHub\secrets\hub-secrets.dpapi.json.

.ENVIRONMENT
    HUB_PORT               Optional HTTP listen port (default: 9088)
    HUB_SECRETS_FILE       Optional path to DPAPI secret bundle
    DJANGO_ENV             Defaults to hub when unset
    DJANGO_SETTINGS_MODULE Defaults to hmis.settings.hub when unset
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallDir = Split-Path -Parent $PSCommandPath
$LogDir = Join-Path $InstallDir "logs"
$StartupLog = Join-Path $LogDir "start-hub.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-StartupLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR")][string]$Level = "INFO"
    )

    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Message"
    Add-Content -Path $StartupLog -Value $line
    Write-Host $line
}

function Is-SensitiveName {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $Name -match '(?i)(secret|token|password|private|encryption|hmac|apikey|api_key)'
}

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

function Set-ProcessEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$Value,
        [Parameter(Mandatory = $true)][string]$Source
    )

    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    if (Is-SensitiveName -Name $Name) {
        Write-StartupLog -Level "INFO" -Message "Loaded $Name from ${Source}: $(Mask-SecretValue -Value $Value)"
    } else {
        Write-StartupLog -Level "INFO" -Message "Loaded $Name from ${Source}: $Value"
    }
}

function Initialize-DpapiType {
    if ($script:DpapiTypeInitialized) {
        return
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
        throw "DPAPI is unavailable on this host. Run start-hub.ps1 from Windows PowerShell on Windows."
    }

    $scopeType = [Type]::GetType("System.Security.Cryptography.DataProtectionScope, System.Security", $false)
    if (-not $scopeType) {
        $scopeType = [Type]::GetType("System.Security.Cryptography.DataProtectionScope, System.Security.Cryptography.ProtectedData", $false)
    }
    if (-not $scopeType) {
        throw "DPAPI DataProtectionScope type is unavailable on this host."
    }

    $script:DpapiProtectedDataType = $protectedDataType
    $script:DpapiLocalMachineScope = [Enum]::Parse($scopeType, "LocalMachine")
    $script:DpapiTypeInitialized = $true
}

function Load-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) {
        Write-StartupLog -Level "WARN" -Message "No .env file found at $Path"
        return
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $name = $matches[1]
            $value = $matches[2].Trim().Trim('"').Trim("'")
            Set-ProcessEnv -Name $name -Value $value -Source ".env"
        }
    }
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

function Load-DpapiSecrets {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) {
        Write-StartupLog -Level "INFO" -Message "No DPAPI secret bundle found at $Path"
        return
    }

    try {
        $raw = (Get-Content $Path -Raw).Trim()
        if (-not $raw) {
            Write-StartupLog -Level "WARN" -Message "DPAPI secret bundle is empty: $Path"
            return
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
            # Backward-compatible plain JSON fallback (not recommended)
            $plainJson = $raw
        } else {
            # Backward-compatible raw base64 payload fallback
            $plainJson = ConvertFrom-DpapiCiphertext -CiphertextB64 $raw
        }

        $secretDoc = $plainJson | ConvertFrom-Json
        $secretDocSecrets = Get-JsonPropertyValue -Object $secretDoc -Name "secrets"
        $secretMap = if ($null -ne $secretDocSecrets) { $secretDocSecrets } else { $secretDoc }

        $secretMap.PSObject.Properties | ForEach-Object {
            $name = $_.Name
            $value = ""
            if ($null -ne $_.Value) {
                $value = [string]$_.Value
            }
            Set-ProcessEnv -Name $name -Value $value -Source "DPAPI"
        }

        Write-StartupLog -Level "INFO" -Message "Loaded DPAPI secret bundle from $Path"
    } catch {
        Write-StartupLog -Level "ERROR" -Message "Failed to load DPAPI secret bundle: $($_.Exception.Message)"
        throw
    }
}

try {
    $envFile = Join-Path $InstallDir ".env"
    Load-DotEnv -Path $envFile

    $secretsFile = if ($env:HUB_SECRETS_FILE) {
        $env:HUB_SECRETS_FILE
    } else {
        Join-Path $InstallDir "secrets\hub-secrets.dpapi.json"
    }
    Load-DpapiSecrets -Path $secretsFile

    if (-not $env:DJANGO_ENV) {
        Set-ProcessEnv -Name "DJANGO_ENV" -Value "hub" -Source "default"
    }
    if (-not $env:DJANGO_SETTINGS_MODULE) {
        Set-ProcessEnv -Name "DJANGO_SETTINGS_MODULE" -Value "hmis.settings.hub" -Source "default"
    }

    $port = if ($env:HUB_PORT) { $env:HUB_PORT } else { "9088" }
    $daphneExe = Join-Path $InstallDir "venv\Scripts\daphne.exe"

    if (-not (Test-Path $daphneExe)) {
        throw "Daphne executable not found at $daphneExe"
    }

    Write-StartupLog -Level "INFO" -Message "Starting Daphne on 0.0.0.0:$port"
    & $daphneExe -b 0.0.0.0 -p $port hmis.asgi:application
    $exitCode = $LASTEXITCODE
    Write-StartupLog -Level "INFO" -Message "Daphne exited with code $exitCode"
    exit $exitCode
} catch {
    Write-StartupLog -Level "ERROR" -Message "Startup failed: $($_.Exception.Message)"
    throw
}
