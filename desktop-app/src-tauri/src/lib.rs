use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use flate2::read::GzDecoder;
use shared_child::SharedChild;
use std::sync::Arc;
use tar::Archive;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State, WindowEvent,
};
#[cfg(not(debug_assertions))]
use tauri::Emitter;
#[cfg(not(debug_assertions))]
use tauri_plugin_deep_link::DeepLinkExt;

pub mod commands;
pub mod config;
pub mod updater;

use commands::{list_printers, print_receipt};
use config::{
    clear_credentials, clear_license_token, get_api_url, get_app_config, get_credentials,
    get_db_encryption_key, get_fernet_key, get_installation_id, get_license_token, is_first_run,
    save_hub_config, set_api_url, set_backup_interval, set_deployment_mode, set_facility_id,
    set_fernet_key, set_hub_url, set_organization_id, set_sync_interval, store_credentials,
    store_license_token, AppConfig,
};
use updater::check_for_updates;

const SIDECAR_READY_TIMEOUT: Duration = Duration::from_secs(600);
const SIDECAR_READY_POLL_INTERVAL: Duration = Duration::from_millis(250);

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

    fn sidecar_log_paths(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
        let log_dir = app
            .path()
            .app_log_dir()
            .ok()
            .or_else(|| app.path().app_data_dir().ok().map(|d| d.join("logs")))?;

        Some((
            log_dir.join("sidecar-stdout.log"),
            log_dir.join("sidecar-stderr.log"),
        ))
    }

    fn tail_log(path: &Path, max_chars: usize) -> Option<String> {
        let contents = std::fs::read_to_string(path).ok()?;
        let trimmed = contents.trim();
        if trimmed.is_empty() {
            return None;
        }

        let char_count = trimmed.chars().count();
        let start = char_count.saturating_sub(max_chars);
        Some(trimmed.chars().skip(start).collect())
    }

    fn stderr_hint(stderr_path: Option<&Path>) -> String {
        match stderr_path {
            Some(path) => match Self::tail_log(path, 2000) {
                Some(tail) => format!("Check {}. Last stderr output:\n{}", path.display(), tail),
                None => format!("Check {} for details.", path.display()),
            },
            None => "Check sidecar-stderr.log for details.".to_string(),
        }
    }

    fn html_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;")
    }

    fn js_escape(value: &str) -> String {
        value
            .replace('\\', "\\\\")
            .replace('\'', "\\'")
            .replace('\n', "\\n")
            .replace('\r', "")
    }

    /// Check if the sidecar HTTP server is actually serving requests.
    ///
    /// We deliberately do NOT use `TcpListener::bind` here: Next.js binds its
    /// port very early in startup, well before it is ready to handle HTTP
    /// requests. A bind probe therefore fires too early and the WebView
    /// navigates to a server that hangs / returns nothing -> blank screen.
    ///
    /// Instead, open a TCP connection, send a minimal HTTP/1.1 GET, and
    /// confirm we read an HTTP response line back.
    fn http_probe(port: u16, path: &str, max_bytes: usize) -> Result<(u16, String), String> {
        let addr = format!("127.0.0.1:{}", port);
        let mut stream = match TcpStream::connect_timeout(
            &match addr.parse() {
                Ok(a) => a,
                Err(e) => return Err(format!("invalid sidecar address: {}", e)),
            },
            Duration::from_millis(500),
        ) {
            Ok(s) => s,
            Err(e) => return Err(format!("connect failed: {}", e)),
        };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));

        let req = format!(
            "GET {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
            path
        );
        stream
            .write_all(req.as_bytes())
            .map_err(|e| format!("request write failed: {}", e))?;

        let mut response = Vec::new();
        let mut buf = [0u8; 1024];
        while response.len() < max_bytes {
            match stream.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => response.extend_from_slice(&buf[..n]),
                Err(e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut =>
                {
                    break;
                }
                Err(e) => return Err(format!("response read failed: {}", e)),
            }
        }

        let response_text = String::from_utf8_lossy(&response).to_string();
        let status_line = response_text.lines().next().unwrap_or_default();
        let status_code = status_line
            .split_whitespace()
            .nth(1)
            .and_then(|code| code.parse::<u16>().ok())
            .ok_or_else(|| format!("missing HTTP status line for {}: {}", path, status_line))?;

        Ok((status_code, response_text))
    }

    fn is_port_ready(port: u16) -> bool {
        match Self::http_probe(port, "/api/desktop-health", 512) {
            Ok((200, _)) => true,
            Ok((status, _)) => {
                log::warn!("Desktop health probe returned HTTP {}", status);
                false
            }
            Err(e) => {
                log::debug!("Desktop health probe failed: {}", e);
                false
            }
        }
    }

    fn is_route_ready(port: u16, path: &str) -> Result<(), String> {
        match Self::http_probe(port, path, 4096) {
            Ok((200, response)) => {
                let lower_response = response.to_ascii_lowercase();
                if lower_response.contains("content-type: text/html")
                    || response.contains("</html>")
                    || response.contains("__next")
                {
                    return Ok(());
                }

                Err(format!(
                    "{} returned HTTP 200 but did not look like an HTML page. First bytes:\n{}",
                    path,
                    response.chars().take(1000).collect::<String>()
                ))
            }
            Ok((status, response)) => Err(format!(
                "{} returned HTTP {}. First bytes:\n{}",
                path,
                status,
                response.chars().take(1000).collect::<String>()
            )),
            Err(e) => Err(format!("{} probe failed: {}", path, e)),
        }
    }

    /// Return the sidecar exit status if it has stopped.
    pub fn exited_status(&self) -> Option<String> {
        let child = self.child.lock().unwrap().clone()?;
        match child.try_wait() {
            Ok(Some(status)) => Some(format!("{:?}", status)),
            Ok(None) => None,
            Err(e) => Some(format!("try_wait failed: {}", e)),
        }
    }

    /// Extract standalone.tar.gz to the app data directory if not already extracted.
    fn ensure_standalone_extracted(app: &AppHandle) -> Result<std::path::PathBuf, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let standalone_dir = app_data_dir.join("standalone");
        let server_js = standalone_dir.join("server.js");
        let version_marker = standalone_dir.join(".vitora-desktop-version");
        let app_version = app
            .config()
            .version
            .clone()
            .unwrap_or_else(|| "unknown".to_string());

        // Find the archive in resources
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;

        let archive_path = resource_dir.join("standalone.tar.gz");
        if !archive_path.exists() {
            return Err(format!(
                "standalone.tar.gz not found at: {}. Is the archive bundled?",
                archive_path.display()
            ));
        }

        // If already extracted, verify it belongs to the current desktop app
        // version. Do not rely on installer/resource mtimes here: Windows
        // installers can preserve or normalize timestamps, which lets an
        // updated shell accidentally reuse an old extracted Next.js bundle.
        if server_js.exists() {
            let extracted_version = std::fs::read_to_string(&version_marker)
                .unwrap_or_default()
                .trim()
                .to_string();

            if extracted_version == app_version {
                log::info!(
                    "Standalone already extracted for v{} at: {}",
                    app_version,
                    standalone_dir.display()
                );
                return Ok(standalone_dir);
            }

            log::info!(
                "Standalone version mismatch (extracted='{}', app='{}'); re-extracting",
                extracted_version,
                app_version
            );
            // Remove the stale extraction so the new bundle is clean.
            // On Windows the OS can briefly hold handles after a process exit
            // (especially after `app.restart()` from the updater), so retry a
            // few times before giving up.
            let mut removed = false;
            for attempt in 1..=5 {
                match std::fs::remove_dir_all(&standalone_dir) {
                    Ok(()) => {
                        removed = true;
                        break;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        removed = true;
                        break;
                    }
                    Err(e) => {
                        log::warn!(
                            "Failed to remove stale standalone dir {} (attempt {}/5): {}",
                            standalone_dir.display(),
                            attempt,
                            e
                        );
                        std::thread::sleep(Duration::from_millis(500 * attempt));
                    }
                }
            }
            if !removed {
                return Err(format!(
                    "Could not remove stale standalone dir {}; files are locked. \
                     Close any running Vitora processes and try again.",
                    standalone_dir.display()
                ));
            }
        }

        log::info!(
            "Extracting standalone bundle from {} to {}",
            archive_path.display(),
            standalone_dir.display()
        );

        // Create target directory
        std::fs::create_dir_all(&standalone_dir)
            .map_err(|e| format!("Failed to create standalone dir: {}", e))?;

        // Extract tar.gz — iterate entries for progress logging
        let tar_gz = std::fs::File::open(&archive_path)
            .map_err(|e| format!("Failed to open archive: {}", e))?;
        let tar = GzDecoder::new(tar_gz);
        let mut archive = Archive::new(tar);

        let start = Instant::now();
        let mut entry_count: u32 = 0;
        for entry_result in archive
            .entries()
            .map_err(|e| format!("Failed to read archive entries: {}", e))?
        {
            let mut entry = entry_result.map_err(|e| format!("Failed to read entry: {}", e))?;
            entry
                .unpack_in(&standalone_dir)
                .map_err(|e| format!("Failed to extract entry: {}", e))?;
            entry_count += 1;
            if entry_count % 500 == 0 {
                log::info!("Extracted {} files so far...", entry_count);
            }
        }
        log::info!(
            "Extracted {} files in {:.1}s",
            entry_count,
            start.elapsed().as_secs_f64()
        );

        // Verify extraction
        if !server_js.exists() {
            return Err(format!(
                "Extraction succeeded but server.js not found at: {}",
                server_js.display()
            ));
        }

        std::fs::write(&version_marker, &app_version)
            .map_err(|e| format!("Failed to write standalone version marker: {}", e))?;

        log::info!(
            "Standalone bundle extracted successfully for v{}",
            app_version
        );
        Ok(standalone_dir)
    }

    /// Spawn the Node.js sidecar with the standalone Next.js build.
    pub fn spawn_sidecar(&self, app: &AppHandle) -> Result<u16, String> {
        let spawn_start = Instant::now();
        let port = Self::find_free_port();
        log::info!("Startup phase: selected sidecar port {}", port);

        // Extract standalone archive to app data dir (first run) or reuse existing
        let extract_start = Instant::now();
        let standalone_dir = Self::ensure_standalone_extracted(app)?;
        log::info!(
            "Startup phase: standalone bundle ready in {:.1}s",
            extract_start.elapsed().as_secs_f64()
        );
        let server_js = standalone_dir.join("server.js");

        // Resolve Node.js binary from resources
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;

        // Resolve Node.js binary: bundled as resource with target triple suffix.
        // On dev, use system node.
        let node_bin = if cfg!(debug_assertions) {
            "node".to_string()
        } else {
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
                // Fallback: try in resource root (flat layout) or system node
                let flat = resource_dir.join(&node_name);
                if flat.exists() {
                    flat.to_string_lossy().to_string()
                } else {
                    log::warn!(
                        "Bundled node not found at {:?} or {:?}, falling back to system node",
                        bundled,
                        flat
                    );
                    "node".to_string()
                }
            }
        };

        // Validate node_modules/next exists before spawning
        let node_modules_dir = standalone_dir.join("node_modules");
        let next_module = node_modules_dir.join("next");
        if !next_module.exists() {
            return Err(format!(
                "node_modules/next not found at: {}. The standalone bundle may be incomplete.",
                next_module.display()
            ));
        }

        let mut child = Command::new(&node_bin);
        child
            .arg(server_js.to_string_lossy().to_string())
            .env("PORT", port.to_string())
            .env("HOSTNAME", "127.0.0.1")
            .env("NEXT_PUBLIC_API_URL", AppConfig::load(app).api_url)
            // Skip Sentry instrumentation (requires native modules not in standalone)
            .env("VITORA_DESKTOP", "1")
            // Explicitly set NODE_PATH so Node.js can always find modules
            .env("NODE_PATH", node_modules_dir.to_string_lossy().to_string())
            .current_dir(&standalone_dir);

        // Pipe Node stdout/stderr to log files in the app log dir so we can
        // actually diagnose blank-screen / startup failures in the field.
        // Previously these were piped to /dev/null, making post-update
        // crashes invisible.
        let log_paths = Self::sidecar_log_paths(app);
        if let Some((stdout_path, _)) = log_paths.as_ref() {
            if let Some(dir) = stdout_path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
        }
        match log_paths {
            Some((stdout_path, stderr_path)) => {
                // Truncate on each spawn so old data doesn't accumulate forever
                // and the most recent run is always at the top.
                let stdout_file = std::fs::File::create(&stdout_path).ok();
                let stderr_file = std::fs::File::create(&stderr_path).ok();
                if let Some(f) = stdout_file {
                    child.stdout(Stdio::from(f));
                } else {
                    child.stdout(Stdio::null());
                }
                if let Some(f) = stderr_file {
                    child.stderr(Stdio::from(f));
                } else {
                    child.stderr(Stdio::null());
                }
                log::info!(
                    "Sidecar stdout -> {} | stderr -> {}",
                    stdout_path.display(),
                    stderr_path.display()
                );
            }
            None => {
                child.stdout(Stdio::null());
                child.stderr(Stdio::null());
            }
        }

        // On Windows, suppress the console window for the child process
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            child.creation_flags(CREATE_NO_WINDOW);
        }

        let child = child
            .spawn()
            .map_err(|e| format!("Failed to spawn Node sidecar: {}", e))?;

        log::info!(
            "Startup phase: Node sidecar process spawned in {:.1}s",
            spawn_start.elapsed().as_secs_f64()
        );

        let shared = Arc::new(
            SharedChild::new(child).map_err(|e| format!("Failed to create SharedChild: {}", e))?,
        );

        *self.child.lock().unwrap() = Some(shared);
        *self.port.lock().unwrap() = port;

        Ok(port)
    }

    /// Wait for the sidecar to start responding (up to timeout).
    ///
    /// Detects early child death by checking `try_wait` so we fail fast with
    /// a useful error instead of waiting the full timeout when Node has
    /// already crashed.
    pub fn wait_for_ready(
        &self,
        timeout: Duration,
        stderr_path: Option<&Path>,
    ) -> Result<(), String> {
        let port = *self.port.lock().unwrap();
        let start = Instant::now();

        while start.elapsed() < timeout {
            // If the child has exited, no point in waiting longer.
            if let Some(child) = self.child.lock().unwrap().clone() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        return Err(format!(
                            "Sidecar exited prematurely with {:?}. {}",
                            status,
                            Self::stderr_hint(stderr_path)
                        ));
                    }
                    Ok(None) => { /* still running */ }
                    Err(e) => {
                        log::warn!("try_wait on sidecar failed: {}", e);
                    }
                }
            }
            if Self::is_port_ready(port) {
                log::info!(
                    "Sidecar became ready on port {} after {:.1}s",
                    port,
                    start.elapsed().as_secs_f64()
                );
                return Ok(());
            }
            std::thread::sleep(SIDECAR_READY_POLL_INTERVAL);
        }

        Err(format!(
            "Sidecar did not become ready on port {} within {:.0}s. {}",
            port,
            timeout.as_secs_f64(),
            Self::stderr_hint(stderr_path)
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

/// Tauri command: get the app version from tauri.conf.json (embedded at build time).
#[tauri::command]
fn get_app_version(app: AppHandle) -> String {
    app.config()
        .version
        .clone()
        .unwrap_or_else(|| "unknown".to_string())
}

/// Build the system tray with menu items.
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
    let version_label = format!("Vitora HMIS v{}", version);

    let version_item = MenuItemBuilder::with_id("version", &version_label)
        .enabled(false)
        .build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show Vitora").build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&version_item)
        .item(&sep1)
        .item(&show)
        .item(&check_updates)
        .item(&sep2)
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
            "check-updates" => {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    updater::check_and_install(app_handle, false).await;
                });
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
        // Single-instance plugin MUST be registered first (before other plugins
        // and before window creation) per Tauri docs. When a second instance
        // launches (e.g. user double-clicks the desktop icon while the app is
        // minimized to tray, or autostart fires alongside a manual launch),
        // its main fn returns immediately and this callback runs in the
        // already-running instance -- preventing duplicate tray icons,
        // duplicate Node sidecars, and duplicate port allocations.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log::info!("Second instance launch intercepted; focusing main window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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
            get_app_version,
            print_receipt,
            list_printers,
            get_api_url,
            set_api_url,
            is_first_run,
            get_app_config,
            set_deployment_mode,
            set_sync_interval,
            set_backup_interval,
            set_hub_url,
            set_facility_id,
            set_organization_id,
            save_hub_config,
            get_db_encryption_key,
            set_fernet_key,
            get_fernet_key,
            get_installation_id,
            store_license_token,
            get_license_token,
            clear_license_token,
            store_credentials,
            get_credentials,
            clear_credentials,
            check_for_updates,
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
                    let urls = event.urls();
                    log::info!("Deep link opened: {:?}", urls);
                    if let Some(main_window) = handle_deep.get_webview_window("main") {
                        let _ = main_window.show();
                        let _ = main_window.set_focus();
                        // Emit event to frontend for route navigation
                        let _ = main_window.emit("deep-link", &urls);
                    }
                });
            }

            // In dev mode, don't spawn sidecar — use the running dev server
            if cfg!(debug_assertions) {
                log::info!("Dev mode: using external dev server at http://127.0.0.1:3009");
                // Navigate main window to dev server
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.navigate("http://127.0.0.1:3009".parse().unwrap());
                }
                return Ok(());
            }

            // Production: spawn sidecar (main window shows loading state from frontend/index.html)
            log::info!("Spawning Node.js sidecar...");
            let handle_clone = handle.clone();

            // Emit startup progress to the loading screen
            fn emit_status(handle: &AppHandle, msg: &str, detail: &str) {
                if let Some(w) = handle.get_webview_window("main") {
                    let msg = SidecarState::js_escape(msg);
                    let detail = SidecarState::js_escape(detail);
                    let _ = w.eval(&format!(
                        "try {{ document.getElementById('status').textContent = '{}'; document.getElementById('startup-detail').textContent = '{}'; }} catch(_) {{}}",
                        msg,
                        detail
                    ));
                }
            }

            // Spawn sidecar in a background thread to avoid blocking the event loop
            std::thread::spawn(move || {
                let state = handle_clone.state::<SidecarState>();
                let startup_start = Instant::now();

                emit_status(
                    &handle_clone,
                    "Preparing application files...",
                    "Checking whether the packaged server needs extraction.",
                );

                match state.spawn_sidecar(&handle_clone) {
                    Ok(port) => {
                        log::info!(
                            "Sidecar spawned on port {} after {:.1}s",
                            port,
                            startup_start.elapsed().as_secs_f64()
                        );

                        emit_status(
                            &handle_clone,
                            "Starting server...",
                            "Waiting for the local health check before loading the sign-in screen.",
                        );

                        // Wait for the sidecar to actually serve HTTP.
                        // After an update the standalone is freshly re-extracted
                        // and Node's first-start (JIT compile, route table) on
                        // slow Windows disks can take longer than a minute.
                        let stderr_path = SidecarState::sidecar_log_paths(&handle_clone)
                            .map(|(_, stderr_path)| stderr_path);
                        match state.wait_for_ready(SIDECAR_READY_TIMEOUT, stderr_path.as_deref()) {
                            Ok(()) => {
                                log::info!(
                                    "Sidecar is ready on port {} after {:.1}s total startup",
                                    port,
                                    startup_start.elapsed().as_secs_f64()
                                );
                                emit_status(
                                    &handle_clone,
                                    "Opening Vitora...",
                                    "Checking that the sign-in screen can render.",
                                );

                                let login_start = Instant::now();
                                let mut login_ready = false;
                                let mut login_error = String::new();
                                while login_start.elapsed() < Duration::from_secs(60) {
                                    match SidecarState::is_route_ready(port, "/login") {
                                        Ok(()) => {
                                            login_ready = true;
                                            break;
                                        }
                                        Err(e) => {
                                            login_error = e;
                                            std::thread::sleep(Duration::from_millis(500));
                                        }
                                    }
                                }

                                if !login_ready {
                                    log::error!("Login route failed readiness check: {}", login_error);
                                    if let Some(main_window) = handle_clone.get_webview_window("main") {
                                        let escaped_error = SidecarState::html_escape(&login_error);
                                        let error_html = format!(
                                            "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to load sign-in</h1><p style='color:%2394a3b8'>The local server started, but the sign-in page did not render successfully.</p><pre style='color:%23ef4444;font-size:12px;white-space:pre-wrap'>{}</pre><p style='color:%2394a3b8;font-size:12px'>Check sidecar-stderr.log for details.</p></body></html>",
                                            escaped_error
                                        );
                                        let _ = main_window.navigate(error_html.parse().unwrap());
                                    }
                                    return;
                                }

                                emit_status(
                                    &handle_clone,
                                    "Opening Vitora...",
                                    "Server is ready. Loading the sign-in screen.",
                                );
                                // Navigate main window to the desktop-aware login gate.
                                // `/` redirects to `/dashboard`, which can skip the
                                // desktop setup/activation checks and leave users with
                                // a blank authenticated shell when no session exists.
                                if let Some(main_window) = handle_clone.get_webview_window("main") {
                                    let url = format!("http://127.0.0.1:{}/login", port);
                                    if let Err(e) = main_window.navigate(url.parse().unwrap()) {
                                        log::error!("Failed to navigate to /login: {}", e);
                                        let escaped_error = SidecarState::html_escape(&e.to_string());
                                        let error_html = format!(
                                            "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to open Vitora</h1><p style='color:%2394a3b8'>The sign-in page was ready, but the desktop WebView could not navigate to it.</p><pre style='color:%23ef4444;font-size:12px;white-space:pre-wrap'>{}</pre></body></html>",
                                            escaped_error
                                        );
                                        let _ = main_window.navigate(error_html.parse().unwrap());
                                    }
                                }

                                let blank_handle = handle_clone.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(Duration::from_secs(8));
                                    if let Some(window) = blank_handle.get_webview_window("main") {
                                        let _ = window.eval(
                                            "try { if (document.body && document.body.innerText.trim().length === 0) { document.body.innerHTML = '<div style=\"font-family:sans-serif;padding:40px;background:#0f172a;color:#f8fafc;min-height:100vh\"><h1>Vitora loaded a blank page</h1><p style=\"color:#94a3b8\">The local server is running, but the desktop WebView did not render visible content after navigation.</p><p style=\"color:#94a3b8;font-size:12px\">Please check sidecar-stderr.log and the desktop app log for details.</p><button onclick=\"location.reload()\" style=\"margin-top:16px;padding:8px 12px\">Reload</button></div>'; } } catch (_) {}"
                                        );
                                    }
                                });

                                // Keep watching for a late sidecar crash after the
                                // initial health check. If Node exits after navigation,
                                // surface a useful page instead of leaving a blank WebView.
                                let monitor_handle = handle_clone.clone();
                                std::thread::spawn(move || {
                                    for _ in 0..120 {
                                        std::thread::sleep(Duration::from_secs(1));
                                        let state = monitor_handle.state::<SidecarState>();
                                        if let Some(status) = state.exited_status() {
                                            log::error!("Sidecar exited after navigation: {}", status);
                                            if let Some(window) = monitor_handle.get_webview_window("main") {
                                                let escaped_status = SidecarState::html_escape(&status);
                                                let error_html = format!(
                                                    "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Vitora stopped unexpectedly</h1><p style='color:%2394a3b8'>The local application server exited after startup.</p><p style='color:%23ef4444;font-size:12px'>Status: {}</p><p style='color:%2394a3b8;font-size:12px'>Check sidecar-stderr.log for details.</p></body></html>",
                                                    escaped_status
                                                );
                                                let _ = window.navigate(error_html.parse().unwrap());
                                            }
                                            break;
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                log::error!("Sidecar failed to become ready: {}", e);
                                // Show error in main window
                                if let Some(main_window) = handle_clone.get_webview_window("main") {
                                    let escaped_error = SidecarState::html_escape(&e);
                                    let error_html = format!(
                                        "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to start Vitora</h1><p style='color:%2394a3b8'>The application server did not respond in time.</p><pre style='color:%23ef4444;font-size:12px;white-space:pre-wrap'>{}</pre></body></html>",
                                        escaped_error
                                    );
                                    let _ = main_window.navigate(error_html.parse().unwrap());
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to spawn sidecar: {}", e);
                        if let Some(main_window) = handle_clone.get_webview_window("main") {
                            let escaped_error = SidecarState::html_escape(&e);
                            let error_html = format!(
                                "data:text/html,<html><body style='font-family:sans-serif;padding:40px;background:%230f172a;color:%23f8fafc'><h1>Failed to start Vitora</h1><p style='color:%2394a3b8'>Could not start the application server.</p><pre style='color:%23ef4444;font-size:12px;white-space:pre-wrap'>{}</pre></body></html>",
                                escaped_error
                            );
                            let _ = main_window.navigate(error_html.parse().unwrap());
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                    // Quit on close. Hiding to tray made the app look closed to
                    // users while the process and sidecar kept running, which
                    // blocked uninstall/update and left stale AppData locks.
                    api.prevent_close();
                    let state = window.state::<SidecarState>();
                    state.kill();
                    window.app_handle().exit(0);
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
