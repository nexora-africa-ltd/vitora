use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::Command;

#[derive(Debug, Deserialize)]
pub struct PrintReceiptPayload {
    pub content: String,
    pub printer_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PrintResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

/// Print a receipt via the system print spooler.
/// On Linux/macOS: uses `lp` command.
/// On Windows: writes directly to the printer share/port.
#[tauri::command]
pub fn print_receipt(payload: PrintReceiptPayload) -> PrintResult {
    log::info!(
        "Print receipt requested (printer: {:?}, content length: {})",
        payload.printer_name,
        payload.content.len()
    );

    #[cfg(target_os = "windows")]
    {
        print_windows(&payload)
    }

    #[cfg(not(target_os = "windows"))]
    {
        print_unix(&payload)
    }
}

/// List available printers on the system.
#[tauri::command]
pub fn list_printers() -> Vec<PrinterInfo> {
    #[cfg(target_os = "windows")]
    {
        list_printers_windows()
    }

    #[cfg(not(target_os = "windows"))]
    {
        list_printers_unix()
    }
}

#[cfg(not(target_os = "windows"))]
fn print_unix(payload: &PrintReceiptPayload) -> PrintResult {
    let mut cmd = Command::new("lp");

    if let Some(ref printer) = payload.printer_name {
        cmd.arg("-d").arg(printer);
    }

    // Set raw mode for ESC/POS
    cmd.arg("-o").arg("raw");
    cmd.stdin(std::process::Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            if let Some(ref mut stdin) = child.stdin {
                if let Err(e) = stdin.write_all(payload.content.as_bytes()) {
                    return PrintResult {
                        success: false,
                        message: format!("Failed to write to printer: {}", e),
                    };
                }
            }
            match child.wait() {
                Ok(status) if status.success() => PrintResult {
                    success: true,
                    message: "Print job submitted".to_string(),
                },
                Ok(status) => PrintResult {
                    success: false,
                    message: format!("Print command exited with: {}", status),
                },
                Err(e) => PrintResult {
                    success: false,
                    message: format!("Failed to wait for print process: {}", e),
                },
            }
        }
        Err(e) => PrintResult {
            success: false,
            message: format!("Failed to start print command: {}", e),
        },
    }
}

#[cfg(target_os = "windows")]
fn print_windows(payload: &PrintReceiptPayload) -> PrintResult {
    // On Windows, use `print /D:<printer>` or write to UNC path
    let printer = payload
        .printer_name
        .as_deref()
        .unwrap_or("LPT1");

    // Write content to a temp file, then send to printer
    let temp_path = std::env::temp_dir().join("vitora_receipt.bin");
    if let Err(e) = std::fs::write(&temp_path, &payload.content) {
        return PrintResult {
            success: false,
            message: format!("Failed to write temp file: {}", e),
        };
    }

    let output = Command::new("cmd")
        .args(["/C", "copy", "/B"])
        .arg(temp_path.to_string_lossy().as_ref())
        .arg(printer)
        .output();

    let _ = std::fs::remove_file(&temp_path);

    match output {
        Ok(o) if o.status.success() => PrintResult {
            success: true,
            message: "Print job submitted".to_string(),
        },
        Ok(o) => PrintResult {
            success: false,
            message: format!(
                "Print failed: {}",
                String::from_utf8_lossy(&o.stderr)
            ),
        },
        Err(e) => PrintResult {
            success: false,
            message: format!("Failed to execute print command: {}", e),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn list_printers_unix() -> Vec<PrinterInfo> {
    let output = Command::new("lpstat").arg("-p").output();
    let default_output = Command::new("lpstat").arg("-d").output();

    let default_name = default_output
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            s.strip_prefix("system default destination: ")
                .map(|n| n.trim().to_string())
        });

    match output {
        Ok(o) => {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|line| {
                    // Format: "printer NAME is idle." or "printer NAME disabled ..."
                    line.strip_prefix("printer ").map(|rest| {
                        let name = rest.split_whitespace().next().unwrap_or("").to_string();
                        let is_default = default_name.as_deref() == Some(&name);
                        PrinterInfo { name, is_default }
                    })
                })
                .collect()
        }
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "windows")]
fn list_printers_windows() -> Vec<PrinterInfo> {
    let output = Command::new("wmic")
        .args(["printer", "get", "name,default", "/format:csv"])
        .output();

    match output {
        Ok(o) => {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .skip(2) // Skip header lines
                .filter(|line| !line.trim().is_empty())
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 3 {
                        Some(PrinterInfo {
                            name: parts[2].trim().to_string(),
                            is_default: parts[1].trim().eq_ignore_ascii_case("true"),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        }
        Err(_) => Vec::new(),
    }
}
