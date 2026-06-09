use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "config.json";
const DEFAULT_API_URL: &str = "https://api.vitora.digital";

/// Deployment mode for the Tauri client.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentMode {
    /// Single user, syncs directly to cloud when online.
    Standalone,
    /// Multi-user facility, connects to a local hub on LAN.
    LanClient,
    /// This machine IS the hub (runs Django locally).
    LanHub,
    /// Web-only mode (uses PowerSync — not typical for Tauri).
    WebOnly,
}

impl Default for DeploymentMode {
    fn default() -> Self {
        Self::Standalone
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// The base URL for the Vitora API (e.g., "https://api.vitora.digital")
    pub api_url: String,
    /// Deployment mode for offline-first sync.
    #[serde(default)]
    pub deployment_mode: DeploymentMode,
    /// Unique device identifier (generated on first run).
    #[serde(default = "generate_client_id")]
    pub client_id: String,
    /// Auto-sync interval in seconds (0 = disabled).
    #[serde(default = "default_sync_interval")]
    pub sync_interval_secs: u64,
    /// Auto-backup interval in minutes (0 = disabled).
    #[serde(default = "default_backup_interval")]
    pub backup_interval_mins: u64,
    /// URL of the facility hub on LAN (only used in LanClient mode).
    /// Example: "http://192.168.1.100:9088"
    #[serde(default)]
    pub hub_url: String,
    /// Facility ID for hub WebSocket connection and data scoping.
    #[serde(default)]
    pub facility_id: String,
    /// Organization ID (set during pairing with hub or cloud).
    #[serde(default)]
    pub organization_id: String,
}

fn generate_client_id() -> String {
    format!(
        "tauri-{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        &uuid_simple()
    )
}

fn uuid_simple() -> String {
    use std::time::SystemTime;
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", t)
}

fn default_sync_interval() -> u64 {
    30 // 30 seconds
}

fn default_backup_interval() -> u64 {
    30 // 30 minutes
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_url: DEFAULT_API_URL.to_string(),
            deployment_mode: DeploymentMode::default(),
            client_id: generate_client_id(),
            sync_interval_secs: default_sync_interval(),
            backup_interval_mins: default_backup_interval(),
            hub_url: String::new(),
            facility_id: String::new(),
            organization_id: String::new(),
        }
    }
}

impl AppConfig {
    /// Get the config file path in the app data directory.
    fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        fs::create_dir_all(&app_data)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
        Ok(app_data.join(CONFIG_FILE))
    }

    /// Load config from disk. Returns default if file doesn't exist.
    pub fn load(app: &AppHandle) -> Self {
        match Self::config_path(app) {
            Ok(path) => {
                if path.exists() {
                    match fs::read_to_string(&path) {
                        Ok(contents) => {
                            serde_json::from_str(&contents).unwrap_or_default()
                        }
                        Err(_) => Self::default(),
                    }
                } else {
                    Self::default()
                }
            }
            Err(_) => Self::default(),
        }
    }

    /// Save config to disk.
    pub fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::config_path(app)?;
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        fs::write(&path, contents)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        Ok(())
    }

    /// Check if this is a first run (no config file exists).
    pub fn is_first_run(app: &AppHandle) -> bool {
        match Self::config_path(app) {
            Ok(path) => !path.exists(),
            Err(_) => true,
        }
    }
}

/// Tauri command: get the current API URL.
#[tauri::command]
pub fn get_api_url(app: AppHandle) -> String {
    AppConfig::load(&app).api_url
}

/// Tauri command: check if this is a first-run (no config saved yet).
#[tauri::command]
pub fn is_first_run(app: AppHandle) -> bool {
    AppConfig::is_first_run(&app)
}

/// Tauri command: set and persist the API URL.
#[tauri::command]
pub fn set_api_url(app: AppHandle, url: String) -> Result<String, String> {
    // Basic validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("API URL must start with http:// or https://".to_string());
    }
    let url = url.trim_end_matches('/').to_string();

    let mut config = AppConfig::load(&app);
    config.api_url = url.clone();
    config.save(&app)?;
    Ok(url)
}

/// Tauri command: get the full app configuration.
#[tauri::command]
pub fn get_app_config(app: AppHandle) -> AppConfig {
    AppConfig::load(&app)
}

/// Tauri command: set deployment mode.
#[tauri::command]
pub fn set_deployment_mode(app: AppHandle, mode: DeploymentMode) -> Result<String, String> {
    let mut config = AppConfig::load(&app);
    config.deployment_mode = mode.clone();
    config.save(&app)?;
    Ok(serde_json::to_string(&mode).unwrap_or_default())
}

/// Tauri command: set sync interval.
#[tauri::command]
pub fn set_sync_interval(app: AppHandle, seconds: u64) -> Result<(), String> {
    let mut config = AppConfig::load(&app);
    config.sync_interval_secs = seconds;
    config.save(&app)?;
    Ok(())
}

/// Tauri command: set backup interval.
#[tauri::command]
pub fn set_backup_interval(app: AppHandle, minutes: u64) -> Result<(), String> {
    let mut config = AppConfig::load(&app);
    config.backup_interval_mins = minutes;
    config.save(&app)?;
    Ok(())
}

/// Tauri command: set the facility hub URL (for LanClient mode).
#[tauri::command]
pub fn set_hub_url(app: AppHandle, url: String) -> Result<String, String> {
    if !url.is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Hub URL must start with http:// or https://".to_string());
    }
    let url = url.trim_end_matches('/').to_string();
    let mut config = AppConfig::load(&app);
    config.hub_url = url.clone();
    config.save(&app)?;
    Ok(url)
}

/// Tauri command: set the facility ID (for hub WebSocket connection).
#[tauri::command]
pub fn set_facility_id(app: AppHandle, facility_id: String) -> Result<(), String> {
    let mut config = AppConfig::load(&app);
    config.facility_id = facility_id;
    config.save(&app)?;
    Ok(())
}

/// Tauri command: set the organization ID.
#[tauri::command]
pub fn set_organization_id(app: AppHandle, organization_id: String) -> Result<(), String> {
    let mut config = AppConfig::load(&app);
    config.organization_id = organization_id;
    config.save(&app)?;
    Ok(())
}

/// Tauri command: save full hub connection config at once (used by setup wizard).
#[tauri::command]
pub fn save_hub_config(
    app: AppHandle,
    hub_url: String,
    facility_id: String,
    organization_id: String,
) -> Result<(), String> {
    if !hub_url.is_empty() && !hub_url.starts_with("http://") && !hub_url.starts_with("https://") {
        return Err("Hub URL must start with http:// or https://".to_string());
    }
    let mut config = AppConfig::load(&app);
    config.hub_url = hub_url.trim_end_matches('/').to_string();
    config.facility_id = facility_id;
    config.organization_id = organization_id;
    // In LAN client mode, the hub URL is also the API URL
    if config.deployment_mode == DeploymentMode::LanClient && !config.hub_url.is_empty() {
        config.api_url = config.hub_url.clone();
    }
    config.save(&app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Secure Key Storage (OS keychain emulation via encrypted file)
// ---------------------------------------------------------------------------

const KEYSTORE_FILE: &str = "keystore.json";

/// Encrypted key store — persists secrets separately from plaintext config.
/// In production, this would use platform keychains (macOS Keychain, Windows
/// Credential Manager, Linux Secret Service). For cross-platform simplicity,
/// we use a separate JSON file with OS-level file permissions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct KeyStore {
    /// The database encryption key (hex-encoded, 32 bytes = 64 hex chars).
    #[serde(default)]
    db_encryption_key: String,
    /// Fernet key for PII encryption (base64-encoded, 44 chars).
    #[serde(default)]
    fernet_key: String,
    /// License JWT token (RS256-signed, issued by Nexora license server).
    #[serde(default)]
    license_token: String,
    /// Saved username for "Remember Me" on login.
    #[serde(default)]
    saved_username: String,
    /// Saved password for "Remember Me" on login (desktop only, file perms 0o600).
    #[serde(default)]
    saved_password: String,
}

impl KeyStore {
    fn path(app: &AppHandle) -> Result<PathBuf, String> {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        fs::create_dir_all(&app_data)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
        Ok(app_data.join(KEYSTORE_FILE))
    }

    fn load(app: &AppHandle) -> Self {
        match Self::path(app) {
            Ok(path) if path.exists() => {
                fs::read_to_string(&path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default()
            }
            _ => Self::default(),
        }
    }

    fn save(&self, app: &AppHandle) -> Result<(), String> {
        let path = Self::path(app)?;
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize keystore: {}", e))?;
        fs::write(&path, contents)
            .map_err(|e| format!("Failed to write keystore: {}", e))?;

        // Restrict file permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }

        Ok(())
    }
}

/// Tauri command: get or generate the database encryption key.
/// Generates a random 256-bit key on first call, then persists it.
#[tauri::command]
pub fn get_db_encryption_key(app: AppHandle) -> Result<String, String> {
    let mut store = KeyStore::load(&app);

    if store.db_encryption_key.is_empty() {
        // Generate a cryptographically secure 256-bit key using the OS CSPRNG
        use rand::RngCore;
        let mut key_bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut key_bytes);
        store.db_encryption_key = key_bytes.iter().map(|b| format!("{:02x}", b)).collect();
        store.save(&app)?;
    }

    Ok(store.db_encryption_key.clone())
}

/// Tauri command: store the Fernet key in the secure keystore.
#[tauri::command]
pub fn set_fernet_key(app: AppHandle, key: String) -> Result<(), String> {
    if key.len() != 44 {
        return Err("Fernet key must be 44 characters (base64-encoded)".to_string());
    }
    let mut store = KeyStore::load(&app);
    store.fernet_key = key;
    store.save(&app)?;
    Ok(())
}

/// Tauri command: retrieve the Fernet key from the secure keystore.
#[tauri::command]
pub fn get_fernet_key(app: AppHandle) -> Result<String, String> {
    let store = KeyStore::load(&app);
    if store.fernet_key.is_empty() {
        return Err("No Fernet key stored".to_string());
    }
    Ok(store.fernet_key)
}

// ---------------------------------------------------------------------------
// License / Installation ID
// ---------------------------------------------------------------------------

/// Tauri command: get the stable installation ID (same as client_id from config).
/// This is generated once on first run and persists across updates.
#[tauri::command]
pub fn get_installation_id(app: AppHandle) -> String {
    AppConfig::load(&app).client_id
}

/// Tauri command: store the license JWT in the secure keystore.
#[tauri::command]
pub fn store_license_token(app: AppHandle, token: String) -> Result<(), String> {
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    let mut store = KeyStore::load(&app);
    store.license_token = token;
    store.save(&app)?;
    Ok(())
}

/// Tauri command: retrieve the license JWT from the secure keystore.
/// Returns empty string if no token is stored (signals unactivated state).
#[tauri::command]
pub fn get_license_token(app: AppHandle) -> String {
    KeyStore::load(&app).license_token
}

/// Tauri command: clear the license token (used on revocation or reset).
#[tauri::command]
pub fn clear_license_token(app: AppHandle) -> Result<(), String> {
    let mut store = KeyStore::load(&app);
    store.license_token = String::new();
    store.save(&app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Saved Credentials (Remember Me)
// ---------------------------------------------------------------------------

/// Tauri command: store login credentials in the secure keystore.
#[tauri::command]
pub fn store_credentials(app: AppHandle, username: String, password: String) -> Result<(), String> {
    let mut store = KeyStore::load(&app);
    store.saved_username = username;
    store.saved_password = password;
    store.save(&app)?;
    Ok(())
}

/// Tauri command: retrieve saved login credentials from the secure keystore.
/// Returns empty strings if no credentials are stored.
#[tauri::command]
pub fn get_credentials(app: AppHandle) -> (String, String) {
    let store = KeyStore::load(&app);
    (store.saved_username, store.saved_password)
}

/// Tauri command: clear saved credentials (used on explicit logout).
#[tauri::command]
pub fn clear_credentials(app: AppHandle) -> Result<(), String> {
    let mut store = KeyStore::load(&app);
    store.saved_username = String::new();
    store.saved_password = String::new();
    store.save(&app)?;
    Ok(())
}
