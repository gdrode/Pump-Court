// "Add camera": pair a phone through the "any network" link (the default: it
// works on every network), over the same Wi-Fi with a QR code, or pick up a
// camera the computer already has (USB etc.).
// Ported from pumpCourt/src/AddCameraDialog.tsx; the logic is in
// logic/tracker/usePhonePairing.ts.
import { useEffect, useRef, useState } from "react";
import { useInternetPairing, useWifiPairing, type PairingStatus } from "../../logic/tracker/usePhonePairing";
import { useTracker } from "../../logic/tracker/TrackerProvider";

type Tab = "internet" | "wifi" | "system";

const STATUS_TEXT: Record<PairingStatus, string> = {
  starting: "Opening a pairing code…",
  waiting: "Waiting for the phone to scan the code…",
  connecting: "Phone found, connecting…",
  connected: "Connected. The phone is now the camera.",
  disconnected: "Phone disconnected.",
  failed: "Could not connect.",
};

export function AddCameraDialog({ onClose }: { onClose: () => void }) {
  // Any network is the default: it works on every network. Wi-Fi pairing opens only if picked.
  const [tab, setTab] = useState<Tab>("internet");
  const [wifiOpened, setWifiOpened] = useState(false);
  const pick = (t: Tab) => {
    if (t === "wifi") setWifiOpened(true);
    setTab(t);
  };
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="dialog panel sketch" onClose={onClose} onCancel={onClose}>
      <header className="dialog__head">
        <h2>Add camera</h2>
        <button type="button" className="player__remove" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "internet"} className={`sketch ${tab === "internet" ? "is-on" : ""}`} onClick={() => pick("internet")}>
          Phone · any network
        </button>
        <button role="tab" aria-selected={tab === "wifi"} className={`sketch ${tab === "wifi" ? "is-on" : ""}`} onClick={() => pick("wifi")}>
          Phone · same Wi-Fi (offline)
        </button>
        <button role="tab" aria-selected={tab === "system"} className={`sketch ${tab === "system" ? "is-on" : ""}`} onClick={() => pick("system")}>
          USB / system camera
        </button>
      </div>
      {/* Kept mounted on other tabs, so the pairing code a phone may be scanning stays valid. */}
      <div hidden={tab !== "internet"}>
        <InternetPairing onDone={onClose} />
      </div>
      {wifiOpened && (
        <div hidden={tab !== "wifi"}>
          <WifiPairing onTryInternet={() => pick("internet")} onDone={onClose} />
        </div>
      )}
      {tab === "system" && <SystemCameras onClose={onClose} />}
    </dialog>
  );
}

function Pair({ url, qr, room }: { url: string; qr: string; room: string }) {
  if (!url) return null;
  return (
    <div className="pair">
      {qr ? <img src={qr} width={240} height={240} alt={`QR code for ${url}`} /> : <div className="pair__qr-placeholder" />}
      <div>
        <p className="pair__url">
          Or type into the phone's browser:
          <br />
          <code>{url}</code>
        </p>
        <p className="pair__code">
          Code <b>{room}</b>
        </p>
        <p className="muted">
          Phone on its side? The picture turns upright by itself; if not, use <b>⟳ Rotate</b> on the camera picture.
        </p>
      </div>
    </div>
  );
}

/** Closes the dialog a moment after the phone connects. */
function useCloseWhenConnected(status: PairingStatus, onDone: () => void) {
  useEffect(() => {
    if (status !== "connected") return;
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [status, onDone]);
}

function WifiPairing({ onTryInternet, onDone }: { onTryInternet: () => void; onDone: () => void }) {
  const p = useWifiPairing();
  useCloseWhenConnected(p.status, onDone);
  return (
    <div className="dialog__body">
      <ol className="steps">
        <li>
          Put the phone on the <b>same network</b> as this laptop. A phone hotspot is the most reliable: venue and school Wi-Fi
          often block devices from seeing each other.
        </li>
        <li>
          Scan the code with the phone's camera. Safari warns that the connection is not private: tap <b>Show Details</b>, then{" "}
          <b>visit this website</b> (Chrome: <b>Advanced → Proceed</b>).
        </li>
        <li>
          Tap <b>Start camera</b> on the phone and allow camera access.
        </li>
      </ol>
      {p.lan?.error && <p className="error">{p.lan.error}</p>}
      {p.lan && p.lan.addresses.length === 0 && (
        <p className="error">This laptop isn't on a network. Join Wi-Fi or a phone's hotspot; this list refreshes by itself.</p>
      )}
      {p.lan && (p.lan.addresses.length > 1 || p.lan.bonjour) && (
        <label className="pair__pick">
          Address in the code{" "}
          <select value={p.host} onChange={(e) => p.setHost(e.target.value)}>
            {p.lan.addresses.map((a) => (
              <option key={a.address} value={a.address}>
                {a.address} ({a.iface}, {a.label})
              </option>
            ))}
            {p.lan.bonjour && <option value={p.lan.bonjour}>{p.lan.bonjour} (by name)</option>}
          </select>
        </label>
      )}
      <Pair url={p.url} qr={p.qr} room={p.room} />
      {p.visit ? (
        <p className="ok-text">
          ✓ A phone reached this laptop ({p.visit}). {p.status === "waiting" ? "Now tap Start camera on the phone." : ""}
        </p>
      ) : (
        p.showTrouble && (
          <div className="trouble">
            <p>
              <b>No phone has reached this laptop yet.</b> If the page never loads on the phone:
            </p>
            <ul className="steps">
              {p.firstThree && (
                <li>
                  Check the phone's address (iPhone: <i>Settings → Wi-Fi → ⓘ → IP Address</i>). It should start with{" "}
                  <b>{p.firstThree}.</b> If not, the two are on different networks.
                </li>
              )}
              <li>
                Using an iPhone hotspot? Turn on <i>Maximize Compatibility</i>, join it from this laptop, then scan again.
              </li>
              <li>Turn off any VPN on the laptop and the phone.</li>
              <li>
                Still nothing:{" "}
                <button type="button" className="linkish" onClick={onTryInternet}>
                  use the Phone · any network tab
                </button>
                , which works on any phone and network.
              </li>
            </ul>
          </div>
        )
      )}
      <p className={p.status === "connected" ? "ok-text" : p.status === "failed" ? "error" : "muted"}>
        {STATUS_TEXT[p.status]} {p.detail}
      </p>
    </div>
  );
}

function InternetPairing({ onDone }: { onDone: () => void }) {
  const p = useInternetPairing();
  useCloseWhenConnected(p.status, onDone);
  const t = p.tunnel;
  return (
    <div className="dialog__body">
      <p>
        Works with <b>any phone on any network</b>, even mobile data. No certificate warning.
      </p>
      <p className="muted">
        The phone's video passes through Cloudflare's tunnel, encrypted and not stored. Use <i>Phone · same Wi-Fi</i> to keep
        everything on this laptop.
      </p>
      {t.status === "starting" && <p className="muted">Starting the internet link… (about 5–10 seconds)</p>}
      {(t.status === "missing" || t.status === "error") && <p className="error">{t.error ?? "The internet link failed."}</p>}
      <Pair url={p.url} qr={p.qr} room={p.room} />
      {p.visit && (
        <p className="ok-text">
          ✓ A phone reached this laptop ({p.visit}). {p.status === "waiting" ? "Now tap Start camera on the phone." : ""}
        </p>
      )}
      {p.url && (
        <p className={p.status === "connected" ? "ok-text" : p.status === "failed" ? "error" : "muted"}>
          {STATUS_TEXT[p.status]} {p.detail}
        </p>
      )}
    </div>
  );
}

function SystemCameras({ onClose }: { onClose: () => void }) {
  const { refreshDevices } = useTracker();
  const [busy, setBusy] = useState(false);
  return (
    <div className="dialog__body">
      <p>Cameras the computer already knows about appear in the camera list by themselves. Connect one, then refresh:</p>
      <ul className="steps">
        <li>
          <b>USB webcam:</b> plug it in.
        </li>
        <li>
          <b>iPhone on a Mac (Continuity Camera):</b> same Apple ID, Wi-Fi and Bluetooth on, phone nearby and locked in landscape.
        </li>
        <li>
          <b>Android or iPhone on Windows:</b> a webcam app such as DroidCam or Camo on the phone and the laptop adds a camera.
        </li>
      </ul>
      <button
        type="button"
        className="start-btn sketch"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await refreshDevices();
          setBusy(false);
          onClose();
        }}
      >
        {busy ? "Refreshing…" : "Refresh camera list"}
      </button>
    </div>
  );
}
