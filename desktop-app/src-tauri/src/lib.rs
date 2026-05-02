use std::net::TcpListener;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use shared_child::SharedChild;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub mod commands;

use commands::print_receipt;

/// Manages the Node.js sidecar process lifecycle.
pub struct SidecarState {
    child: Mutex<Option<Arc<SharedChild>>>,
    port: Mutex<u16>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(0),
        }
    }

    /// Find a free TCP port on localhost.
    fn find_free_port() -> u16 {
        TcpListener::bind("127.0.0.1:0")
            .expect("Failed to bind to a free port")
            .local_addr()
            .expect("Failed to get local address")
            .port()
    }

    /// Check if the sidecar HTTP server is responding.
    fn is_port_ready(port: u16) -> bool {
        TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
    }

    /// Spawn the Node.js sidecar with the standalone Next.js build.
    pub fn spawn_sidecar(&self, app: &AppHandle) -> Result<u16, String> {
        let port = Self::find_free_port();

        // Resolve paths relative to the app resource directory
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;

        let standalone_dir = resource_dir.join("standalone");
        let server_js = standalone_dir.join("server.js");

        if !server_js.exists() {
            return Err(format!(
                "server.js not found at: {}. Is the standalone build bundled?",
                server_js.display()
            ));
        }

        // In dev mode, use system node; in prod, use bundled node
        let node_bin = if cfg!(debug_assertions) {
            "node".to_string()
        } else {
            let bundled = resource_dir.join("node").join("node");
            if bundled.exists() {
                bundled.to_string_lossy().to_string()
            } else {
                "node".to_string()
            }
        };

        let child = Command::new(&node_bin)
            .arg(server_js.to_string_lossy().to_string())
            .env("PORT", port.to_string())
            .env("HOSTNAME", "127.0.0.1")
            .current_dir(&standalone_dir)
            .spawn()
            .map_err(|e| format!("Failed to spawn Node sidecar: {}", e))?;

        let shared = Arc::new(
            SharedChild::new(child)
                .map_err(|e| format!("Failed to create SharedChild: {}", e))?,
        );

        *self.child.lock().unwrap() = Some(shared);
        *self.port.lock().unwrap() = port;

        Ok(port)
    }

    /// Wait for the sidecar to start responding (up to timeout).
    pub fn wait_for_ready(&self, timeout: Duration) -> Result<(), String> {
        let port = *self.port.lock().unwrap();
        let start = Instant::now();

        while start.elapsed() < timeout {
            if Self::is_port_ready(port) {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        Err(format!(
            "Sidecar did not become ready within {:?}",
            timeout
        ))
    }

    /// Kill the sidecar process.
    pub fn kill(&self) {
        if let Some(child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    pub fn port(&self) -> u16 {
        *self.port.lock().unwrap()
    }
}

impl Default for SidecarState {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SidecarState {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Tauri command: get the port the sidecar is running on.
#[tauri::command]
fn get_sidecar_port(state: State<SidecarState>) -> u16 {
    state.port()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar = SidecarState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            print_receipt,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<SidecarState>();

            // In dev mode, don't spawn sidecar — use the running dev server
            if cfg!(debug_assertions) {
                log::info!("Dev mode: using external dev server at http://127.0.0.1:3009");
                return Ok(());
            }

            // Spawn sidecar
            log::info!("Spawning Node.js sidecar...");
            match state.spawn_sidecar(&handle) {
                Ok(port) => {
                    log::info!("Sidecar spawned on port {}", port);

                    // Wait for the sidecar to be ready (max 15s)
                    match state.wait_for_ready(Duration::from_secs(15)) {
                        Ok(()) => {
                            log::info!("Sidecar is ready");
                            // Navigate the main window to the sidecar URL
                            if let Some(window) = app.get_webview_window("main") {
                                let url = format!("http://127.0.0.1:{}", port);
                                let _ = window.navigate(url.parse().unwrap());
                            }
                        }
                        Err(e) => {
                            log::error!("Sidecar failed to start: {}", e);
                            // Show error dialog
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.navigate(
                                    "data:text/html,<h1>Failed to start Vitora</h1><p>The application server did not respond in time.</p>"
                                        .parse()
                                        .unwrap(),
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    log::error!("Failed to spawn sidecar: {}", e);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill sidecar when the main window is destroyed
                let state = window.state::<SidecarState>();
                state.kill();
            }
        })
        .run(tauri::generate_context!())
        .expect("Error while running Vitora HMIS");
}
