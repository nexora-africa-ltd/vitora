use std::net::TcpListener;
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use shared_child::SharedChild;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State, WindowEvent,
};

pub mod commands;
pub mod config;

use commands::{list_printers, print_receipt};
use config::{get_api_url, is_first_run, set_api_url, AppConfig};

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

        // Resolve Node.js binary: Tauri externalBin places it adjacent to the exe
        // with the target triple suffix. On dev, use system node.
        let node_bin = if cfg!(debug_assertions) {
            "node".to_string()
        } else {
            // externalBin resolves to: <app_dir>/binaries/node-<target-triple>[.exe]
            let bin_dir = resource_dir.join("binaries");
            let node_name = if cfg!(target_os = "windows") {
                format!("node-{}.exe", env!("TAURI_ENV_TARGET_TRIPLE"))
            } else {
                format!("node-{}", env!("TAURI_ENV_TARGET_TRIPLE"))
            };
            let bundled = bin_dir.join(&node_name);
            if bundled.exists() {
                bundled.to_string_lossy().to_string()
            } else {
                // Fallback: try system node
                log::warn!("Bundled node not found at {:?}, falling back to system node", bundled);
                "node".to_string()
            }
        };

        let child = Command::new(&node_bin)
            .arg(server_js.to_string_lossy().to_string())
            .env("PORT", port.to_string())
            .env("HOSTNAME", "127.0.0.1")
            .env("NEXT_PUBLIC_API_URL", AppConfig::load(app).api_url)
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

/// Build the system tray with menu items.
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show Vitora").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&separator)
        .item(&quit)
        .build()?;

    let icon = Image::from_path("icons/icon.png").unwrap_or_else(|_| {
        // Fallback: use the embedded icon from tauri.conf.json
        Image::from_bytes(include_bytes!("../icons/32x32.png"))
            .expect("Failed to load fallback tray icon")
    });

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("Vitora HMIS")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                let state = app.state::<SidecarState>();
                state.kill();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![
            get_sidecar_port,
            print_receipt,
            list_printers,
            get_api_url,
            set_api_url,
            is_first_run,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // --- System tray ---
            setup_tray(app)?;

            // --- Deep link registration ---
            // Register vitora:// scheme handler
            #[cfg(not(debug_assertions))]
            {
                let handle_deep = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    log::info!("Deep link opened: {:?}", event.urls());
                    if let Some(main_window) = handle_deep.get_webview_window("main") {
                        let _ = main_window.show();
                        let _ = main_window.set_focus();
                        // Emit event to frontend for route navigation
                        let _ = main_window.emit("deep-link", event.urls());
                    }
                });
            }

            // In dev mode, don't spawn sidecar — use the running dev server
            if cfg!(debug_assertions) {
                log::info!("Dev mode: using external dev server at http://127.0.0.1:3009");
                // Show main window immediately in dev (no splash)
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
                // Close splash if it exists in dev
                if let Some(splash) = app.get_webview_window("splash") {
                    let _ = splash.close();
                }
                return Ok(());
            }

            // Production: spawn sidecar and show splash while loading
            log::info!("Spawning Node.js sidecar...");
            let handle_clone = handle.clone();

            // Spawn sidecar in a background thread to avoid blocking the event loop
            std::thread::spawn(move || {
                let state = handle_clone.state::<SidecarState>();

                match state.spawn_sidecar(&handle_clone) {
                    Ok(port) => {
                        log::info!("Sidecar spawned on port {}", port);

                        // Wait for the sidecar to be ready (max 20s)
                        match state.wait_for_ready(Duration::from_secs(20)) {
                            Ok(()) => {
                                log::info!("Sidecar is ready on port {}", port);
                                // Navigate main window to sidecar URL and show it
                                if let Some(main_window) = handle_clone.get_webview_window("main") {
                                    let url = format!("http://127.0.0.1:{}", port);
                                    let _ = main_window.navigate(url.parse().unwrap());
                                    let _ = main_window.show();
                                }
                                // Close splash
                                if let Some(splash) = handle_clone.get_webview_window("splash") {
                                    let _ = splash.close();
                                }
                            }
                            Err(e) => {
                                log::error!("Sidecar failed to become ready: {}", e);
                                // Show error in main window
                                if let Some(main_window) = handle_clone.get_webview_window("main") {
                                    let error_html = format!(
                                        "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to start Vitora</h1><p style='color:%2394a3b8'>The application server did not respond in time.</p><p style='color:%23ef4444;font-size:12px'>{}</p></body></html>",
                                        e
                                    );
                                    let _ = main_window.navigate(error_html.parse().unwrap());
                                    let _ = main_window.show();
                                }
                                if let Some(splash) = handle_clone.get_webview_window("splash") {
                                    let _ = splash.close();
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to spawn sidecar: {}", e);
                        if let Some(main_window) = handle_clone.get_webview_window("main") {
                            let error_html = format!(
                                "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to start Vitora</h1><p style='color:%2394a3b8'>Could not start the application server.</p><p style='color:%23ef4444;font-size:12px'>{}</p></body></html>",
                                e
                            );
                            let _ = main_window.navigate(error_html.parse().unwrap());
                            let _ = main_window.show();
                        }
                        if let Some(splash) = handle_clone.get_webview_window("splash") {
                            let _ = splash.close();
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                    // Minimize to tray instead of closing
                    api.prevent_close();
                    let _ = window.hide();
                    log::info!("Main window hidden to tray");
                }
                WindowEvent::Destroyed => {
                    // Kill sidecar when the app is truly destroyed
                    let state = window.state::<SidecarState>();
                    state.kill();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("Error while running Vitora HMIS");
}
