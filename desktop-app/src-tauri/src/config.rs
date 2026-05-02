use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "config.json";
const DEFAULT_API_URL: &str = "https://api.vitora.digital";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// The base URL for the Vitora API (e.g., "https://api.vitora.digital")
    pub api_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_url: DEFAULT_API_URL.to_string(),
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
