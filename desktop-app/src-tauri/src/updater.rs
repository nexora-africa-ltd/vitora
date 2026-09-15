// Manual "Check for Updates" flow.
//
// The tauri-plugin-updater plugin runs an automatic check in the background,
// but users (and admins doing remote support) sometimes want to force a check
// on demand — typically from the tray menu or a Settings UI button.
//
// This module exposes a single async function `check_and_install` that:
//   1. Queries the configured update endpoint
//   2. If no update: shows an "up-to-date" dialog
//   3. If an update is available: prompts the user with version + release notes
//   4. On confirm: downloads + installs, then restarts the app
//
// It is invoked from:
//   - The system tray menu item "Check for Updates…" (see lib.rs setup_tray)
//   - A Tauri command `check_for_updates` exposed to the frontend so a
//     Settings page can offer the same action.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

use crate::SidecarState;

const BACKGROUND_CHECK_INTERVAL: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
}

fn current_version(app: &AppHandle) -> String {
    app.config()
        .version
        .clone()
        .unwrap_or_else(|| "unknown".to_string())
}

async fn fetch_update_info(app: &AppHandle) -> Result<UpdateInfo, String> {
    let current_version = current_version(app);
    let updater = app
        .updater()
        .map_err(|error| format!("Updater unavailable: {error}"))?;

    match updater.check().await.map_err(|error| error.to_string())? {
        Some(update) => Ok(UpdateInfo {
            available: true,
            current_version,
            version: Some(update.version),
            body: update.body,
        }),
        None => Ok(UpdateInfo {
            available: false,
            current_version,
            version: None,
            body: None,
        }),
    }
}

/// Run a manual update check, prompting the user via native dialogs.
///
/// `silent_when_uptodate` suppresses the "you are on the latest version"
/// dialog — useful for the background auto-check, but the tray/UI entry
/// points always pass `false` so the user gets feedback.
pub async fn check_and_install(app: AppHandle, silent_when_uptodate: bool) {
    let current = current_version(&app);

    // Build the updater handle. If the plugin is misconfigured this fails
    // before any network I/O.
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::error!("Updater unavailable: {}", e);
            show_error(&app, "Update check failed", &format!("Updater unavailable: {e}"));
            return;
        }
    };

    log::info!("Manual update check started (current version: {})", current);

    match updater.check().await {
        Ok(Some(update)) => {
            let new_version = update.version.clone();
            let body = update
                .body
                .clone()
                .unwrap_or_else(|| "No release notes provided.".to_string());

            log::info!("Update available: {} -> {}", current, new_version);

            let prompt = format!(
                "A new version of Vitora HMIS is available.\n\nCurrent: v{current}\nNew: v{new_version}\n\nRelease notes:\n{body}\n\nInstall now? The app will restart automatically once the update is applied."
            );

            // confirm() is a blocking call in this updater plugin; route it
            // through spawn_blocking so we don't stall the async runtime.
            let app_for_prompt = app.clone();
            let confirmed = tauri::async_runtime::spawn_blocking(move || {
                app_for_prompt
                    .dialog()
                    .message(prompt)
                    .title("Update available")
                    .kind(MessageDialogKind::Info)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Install now".to_string(),
                        "Later".to_string(),
                    ))
                    .blocking_show()
            })
            .await
            .unwrap_or(false);

            if !confirmed {
                log::info!("User declined update to {}", new_version);
                return;
            }

            // Download + install. The closures give us progress hooks; we log
            // for now and could surface a real progress UI later.
            let mut downloaded: usize = 0;
            let result = update
                .download_and_install(
                    |chunk_len, content_len| {
                        downloaded += chunk_len;
                        if let Some(total) = content_len {
                            log::debug!(
                                "Update download progress: {} / {} bytes",
                                downloaded,
                                total
                            );
                        }
                    },
                    || {
                        log::info!("Update download complete; installing...");
                    },
                )
                .await;

            match result {
                Ok(()) => {
                    log::info!("Update installed; preparing to restart app");

                    // Explicitly kill the Node.js sidecar BEFORE restarting.
                    //
                    // On Windows, `app.restart()` calls `process::exit()` after
                    // spawning the new instance, which does NOT run Drop impls.
                    // The Node.js child therefore survives the restart, keeps
                    // its file handles on the extracted standalone directory,
                    // and blocks the new instance's re-extraction of the
                    // updated standalone.tar.gz -- producing a corrupt
                    // standalone and a blank window.
                    let state = app.state::<SidecarState>();
                    state.kill();
                    // Give the OS a moment to release file handles before
                    // the new process starts and tries to re-extract.
                    std::thread::sleep(std::time::Duration::from_millis(500));

                    log::info!("Restarting app");
                    app.restart();
                }
                Err(e) => {
                    log::error!("Update install failed: {}", e);
                    show_error(
                        &app,
                        "Update failed",
                        &format!(
                            "The update to v{new_version} could not be installed.\n\n{e}\n\nThe current version is still running."
                        ),
                    );
                }
            }
        }
        Ok(None) => {
            log::info!("No update available (current: {})", current);
            if !silent_when_uptodate {
                show_info(
                    &app,
                    "Vitora HMIS is up to date",
                    &format!("You're running the latest version (v{current})."),
                );
            }
        }
        Err(e) => {
            log::error!("Update check failed: {}", e);
            show_error(
                &app,
                "Update check failed",
                &format!("Could not check for updates.\n\n{e}\n\nMake sure you're connected to the internet and try again."),
            );
        }
    }
}

fn show_info(app: &AppHandle, title: &str, message: &str) {
    let app = app.clone();
    let title = title.to_string();
    let message = message.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title(title)
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::Ok)
            .blocking_show();
    });
}

fn show_error(app: &AppHandle, title: &str, message: &str) {
    let app = app.clone();
    let title = title.to_string();
    let message = message.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title(title)
            .kind(MessageDialogKind::Error)
            .buttons(MessageDialogButtons::Ok)
            .blocking_show();
    });
}

/// Tauri command exposed to the frontend (Settings page, etc.).
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    check_and_install(app, false).await;
}

/// Return update availability for the desktop Settings screen without prompting
/// or downloading anything.
#[tauri::command]
pub async fn get_update_status(app: AppHandle) -> Result<UpdateInfo, String> {
    fetch_update_info(&app).await
}

/// Download and install an update only after the Settings UI has confirmed it.
#[tauri::command]
pub async fn install_available_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|error| format!("Updater unavailable: {error}"))?;
    let update = updater
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    app.state::<SidecarState>().kill();
    std::thread::sleep(std::time::Duration::from_millis(500));
    app.restart();
}

/// Check after the packaged sidecar is healthy, then once every 24 hours.
/// Availability is surfaced as a native notification; installation always needs
/// an explicit user action from Settings or the tray menu.
pub fn start_background_update_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            match fetch_update_info(&app).await {
                Ok(update) if update.available => {
                    let version = update.version.as_deref().unwrap_or("a new version");
                    if let Err(error) = app
                        .notification()
                        .builder()
                        .title("Vitora update available")
                        .body(format!("Version {version} is ready to install. Open Settings or the tray menu to update."))
                        .show()
                    {
                        log::warn!("Could not show update notification: {}", error);
                    }
                }
                Ok(_) => log::debug!("Desktop update check found no newer version"),
                Err(error) => log::warn!("Background update check failed: {}", error),
            }

            tokio::time::sleep(BACKGROUND_CHECK_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::BACKGROUND_CHECK_INTERVAL;

    #[test]
    fn background_checks_run_daily() {
        assert_eq!(BACKGROUND_CHECK_INTERVAL.as_secs(), 24 * 60 * 60);
    }
}
