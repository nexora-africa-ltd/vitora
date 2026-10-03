// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
//! Native LAN hub discovery for Tauri workstations.
//! Use `discover_hubs` from the frontend; it broadcasts `VITORA_DISCOVER` and accepts an optional timeout in milliseconds.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::{SocketAddrV4, UdpSocket};
use std::time::{Duration, Instant};

const DISCOVERY_MAGIC: &[u8] = b"VITORA_DISCOVER";
const DISCOVERY_PORT: u16 = 19088;
const DEFAULT_TIMEOUT_MS: u64 = 3_500;
const MAX_TIMEOUT_MS: u64 = 10_000;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct DiscoveredHub {
    pub url: String,
    pub facility_id: String,
    pub facility_name: String,
    pub hub_id: String,
    pub version: String,
}

fn parse_discovery_response(payload: &[u8]) -> Option<DiscoveredHub> {
    let hub: DiscoveredHub = serde_json::from_slice(payload).ok()?;
    if hub.hub_id.trim().is_empty()
        || hub.url.trim().is_empty()
        || (!hub.url.starts_with("http://") && !hub.url.starts_with("https://"))
    {
        return None;
    }
    Some(hub)
}

fn discover_hubs_blocking(timeout: Duration) -> Result<Vec<DiscoveredHub>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .map_err(|error| format!("Could not open UDP discovery socket: {error}"))?;
    socket
        .set_broadcast(true)
        .map_err(|error| format!("Could not enable UDP broadcast: {error}"))?;
    socket
        .send_to(
            DISCOVERY_MAGIC,
            SocketAddrV4::new(std::net::Ipv4Addr::BROADCAST, DISCOVERY_PORT),
        )
        .map_err(|error| format!("Could not broadcast hub discovery: {error}"))?;

    let deadline = Instant::now() + timeout;
    let mut hubs = Vec::new();
    let mut seen = HashSet::new();
    let mut buffer = [0_u8; 2_048];

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        socket
            .set_read_timeout(Some(remaining))
            .map_err(|error| format!("Could not set UDP discovery timeout: {error}"))?;

        match socket.recv_from(&mut buffer) {
            Ok((size, _)) => {
                if let Some(hub) = parse_discovery_response(&buffer[..size]) {
                    let identity = (hub.hub_id.clone(), hub.url.clone());
                    if seen.insert(identity) {
                        hubs.push(hub);
                    }
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                break;
            }
            Err(error) => return Err(format!("Hub discovery receive failed: {error}")),
        }
    }

    Ok(hubs)
}

#[tauri::command]
pub async fn discover_hubs(timeout_ms: Option<u64>) -> Result<Vec<DiscoveredHub>, String> {
    let timeout = Duration::from_millis(
        timeout_ms
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .clamp(1, MAX_TIMEOUT_MS),
    );
    tokio::task::spawn_blocking(move || discover_hubs_blocking(timeout))
        .await
        .map_err(|error| format!("Hub discovery task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_valid_hub_discovery_response() {
        let hub = parse_discovery_response(
            br#"{"url":"http://192.168.100.88:9088","facility_id":"facility-1","facility_name":"Sample Clinic","hub_id":"hub-1","version":"1.0.20"}"#,
        )
        .expect("valid discovery response");

        assert_eq!(hub.url, "http://192.168.100.88:9088");
        assert_eq!(hub.hub_id, "hub-1");
    }

    #[test]
    fn rejects_discovery_response_without_a_hub_identity() {
        assert!(parse_discovery_response(br#"{"url":"http://192.168.100.88:9088"}"#).is_none());
    }

    #[test]
    fn rejects_discovery_response_with_a_non_http_url() {
        assert!(parse_discovery_response(
            br#"{"url":"file:///hub","facility_id":"facility-1","facility_name":"Sample Clinic","hub_id":"hub-1","version":"1.0.20"}"#
        )
        .is_none());
    }
}
