// Logic for the "Add camera" dialog (ported from pumpCourt/src/AddCameraDialog.tsx):
// starts the internet link, opens a pairing room, makes the QR code, and hands
// the phone's stream to the tracker once it connects. Only the "any network"
// link is offered: it is the one tested at venues.
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { backend, errorText } from "../../api/backend";
import type { TunnelStatus } from "../../api/types";
import { openPhoneLink, type PhoneLink, type PhoneStatus } from "./phoneLink";
import { useTracker } from "./TrackerProvider";

export type PairingStatus = PhoneStatus | "starting";

/** One pairing room. `viaInternet`: the QR code points at the Cloudflare tunnel, and the phone sends JPEG frames. */
function usePairingRoom(viaInternet: boolean) {
  const tracker = useTracker();
  const [room, setRoom] = useState("");
  const [status, setStatus] = useState<PairingStatus>("starting");
  const [detail, setDetail] = useState("");
  const [visit, setVisit] = useState<string | null>(null);
  const label = useRef(tracker.nextPhoneLabel);
  const addPhone = useRef(tracker.addPhone);
  addPhone.current = tracker.addPhone;

  // Open the room. If the dialog closes before a phone connects, close it again.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let link: PhoneLink | null = null;
    let handedOff = false;
    let gone = false;
    let connected = false;
    const handOff = () => {
      if (!connected || !stream || !link || handedOff) return;
      handedOff = true;
      addPhone.current({ label: label.current, stream, link, viaInternet });
    };
    openPhoneLink({
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d ?? "");
        connected = s === "connected";
        handOff();
      },
      onStream: (s) => {
        stream = s;
      },
      onVisit: (from) => setVisit(from || "a phone"),
    }).then(
      (l) => {
        if (gone) return l.close();
        link = l;
        setRoom(l.room);
        handOff();
      },
      (err) => {
        setStatus("failed");
        setDetail(errorText(err));
      },
    );
    return () => {
      gone = true;
      if (!handedOff) link?.close();
    };
  }, [viaInternet]);

  return { room, status, detail, visit };
}

/** A QR code image (data URL) for `url`. */
function useQr(url: string) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!url) return setQr("");
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setQr, () => setQr(""));
  }, [url]);
  return qr;
}

/** "Any network": a public https address through Cloudflare; video comes as JPEG frames. */
export function useInternetPairing() {
  const pairing = usePairingRoom(true);
  const release = useRef(useTracker().releaseTunnel);
  const [tunnel, setTunnel] = useState<TunnelStatus>({ status: "starting", url: null, error: null });

  // Start the tunnel, then poll until it has an address (usually 5–10 s).
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const t = await backend.tunnelStatus();
        if (!alive) return;
        setTunnel(t);
        if (t.status === "starting") timer = window.setTimeout(poll, 1000);
      } catch (e) {
        if (alive) setTunnel({ status: "error", url: null, error: errorText(e) });
      }
    };
    backend.tunnelStart().then(poll, poll);
    return () => {
      alive = false;
      clearTimeout(timer);
      // Dialog closed: keep the link only if a paired phone uses it (a phone
      // that connected was already handed to the tracker).
      release.current();
    };
  }, []);

  const url = tunnel.url && pairing.room ? `${tunnel.url}/phone.html?room=${pairing.room}&mode=relay` : "";
  return { ...pairing, tunnel, url, qr: useQr(url) };
}
