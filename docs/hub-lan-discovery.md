<!-- LAN hub discovery operations reference. Read during hub installation, updates, workstation onboarding, or discovery troubleshooting. Inputs: TCP 9088 and UDP 19088 on the facility private LAN. -->

# Hub LAN Discovery

Vitora hubs use two LAN ports:

| Port | Protocol | Purpose |
|---|---|---|
| `9088` | TCP | API, login, sync, and WebSocket traffic |
| `19088` | UDP | Discovery only |

Discovery never carries clinical or authentication traffic. A workstation broadcasts `VITORA_DISCOVER` to UDP `19088`; a hub replies with its current HTTP address and identity. The desktop app then verifies the candidate with `GET /api/hub/health/` before saving or using it.

## Workstation Behavior

On first setup, choose **Facility Workstation** and select **Scan Network**. The desktop app tries native UDP discovery first. If broadcast traffic is unavailable, it performs a verified HTTP subnet scan and finally permits manual hub URL entry.

If a DHCP lease changes the hub address, a configured workstation automatically repeats the same verified discovery flow before login. It only replaces the saved address when the discovered facility and organization match its existing configuration.

## Installation And Updates

Windows and Linux install/update scripts add private-LAN firewall access for both ports. Linux container deployments publish `19088/udp` as well as the configured TCP hub port.

For Linux systems using UFW:

```bash
sudo ufw allow 9088/tcp comment "Vitora Hub"
sudo ufw allow 19088/udp comment "Vitora Hub Discovery"
```

## Troubleshooting

Check discovery from the hub health endpoint:

```bash
curl http://localhost:9088/api/hub/health/
```

When `discovery.udp` is `active`, the responder is listening. When it is `unavailable`, the hub remains usable over TCP `9088`; the `discovery.error` field reports why UDP could not start. Free UDP `19088` or correct the private-LAN firewall rule, then restart the hub.

Use the manual HTTP hub URL only for networks that intentionally block broadcast traffic or isolate workstations from the hub VLAN.
