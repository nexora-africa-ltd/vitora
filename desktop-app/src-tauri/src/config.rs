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
