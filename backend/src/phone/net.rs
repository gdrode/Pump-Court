//! This laptop's network addresses, best first, for the QR code.

use serde::Serialize;
use std::net::IpAddr;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanAddress {
    pub address: String,
    pub iface: String,
    /// Why it is ranked where it is, shown to the operator.
    pub label: String,
}

/// What the "Add camera" dialog needs to build a QR code a phone can reach.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanInfo {
    pub addresses: Vec<LanAddress>,
    /// The Mac's Bonjour name (e.g. "Alexs-MacBook.local"); iPhones find it without the number.
    pub bonjour: Option<String>,
    pub port: u16,
    /// Why the phone server isn't running, if it isn't.
    pub error: Option<String>,
}

const VIRTUAL: &[&str] = &[
    "utun", "tun", "tap", "bridge", "awdl", "llw", "vmnet", "vboxnet", "docker", "veth", "br-", "virbr", "zt",
    "tailscale", "wg", "vethernet", "virtualbox", "vmware", "hyper-v", "loopback", "bluetooth",
];

/// Ranks one interface: phone hotspot first, then Wi-Fi/Ethernet, VPNs and virtual adapters last.
fn rank(iface: &str, address: &str) -> (u8, &'static str) {
    let name = iface.to_lowercase();
    if address.starts_with("172.20.10.") || address.starts_with("192.168.43.") {
        (0, "phone hotspot")
    } else if VIRTUAL.iter().any(|v| name.starts_with(v) || name.contains(&format!("({v}"))) {
        (2, "VPN or virtual adapter: phones usually cannot reach this")
    } else if ["en", "wl", "eth", "wi-fi", "wifi", "wireless", "ethernet", "local area connection"]
        .iter()
        .any(|p| name.starts_with(p))
    {
        (1, "Wi-Fi or Ethernet")
    } else {
        (1, "network adapter")
    }
}

/// IPv4 addresses a phone might reach, best first. Link-local addresses
/// (169.254.x.x) are left out: they only appear when a network has no router.
pub fn lan_addresses() -> Vec<LanAddress> {
    let mut out: Vec<(u8, LanAddress)> = local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(iface, ip)| match ip {
            IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified() => Some((iface, v4.to_string())),
            _ => None,
        })
        .map(|(iface, address)| {
            let (r, label) = rank(&iface, &address);
            (r, LanAddress { address, iface, label: label.into() })
        })
        .collect();
    out.sort_by_key(|(r, _)| *r);
    out.dedup_by(|a, b| a.1.address == b.1.address);
    out.into_iter().map(|(_, a)| a).collect()
}

/// This Mac's Bonjour name. Other systems return `None`.
pub fn bonjour_name() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let out = std::process::Command::new("scutil").args(["--get", "LocalHostName"]).output().ok()?;
    let name = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (!name.is_empty()).then(|| format!("{name}.local"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hotspot_beats_wifi_beats_vpn() {
        assert_eq!(rank("en0", "172.20.10.3").0, 0);
        assert_eq!(rank("Wi-Fi", "192.168.1.5"), (1, "Wi-Fi or Ethernet"));
        assert_eq!(rank("wlan0", "10.0.0.7"), (1, "Wi-Fi or Ethernet"));
        assert_eq!(rank("utun3", "10.8.0.2").0, 2);
        assert_eq!(rank("vEthernet (WSL)", "172.28.0.1").0, 2);
        assert_eq!(rank("docker0", "172.17.0.1").0, 2);
    }
}
