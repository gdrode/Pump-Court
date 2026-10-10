// "Add camera": pair a phone through the "any network" link (Cloudflare
// tunnel: the one phone link tested at venues), or pick up a camera the
// computer already has (USB etc.). The Wi-Fi (WebRTC) tab was removed.
// Ported from pumpCourt/src/AddCameraDialog.tsx; the logic is in
// logic/tracker/usePhonePairing.ts.
import { useEffect, useRef, useState } from "react";
import { useInternetPairing, type PairingStatus } from "../../logic/tracker/usePhonePairing";
import { useTracker } from "../../logic/tracker/TrackerProvider";

type Tab = "internet" | "system";

const STATUS_TEXT: Record<PairingStatus, string> = {
  starting: "Opening a pairing code…",
  waiting: "Waiting for the phone to scan the code…",
  connecting: "Phone found, connecting…",
  connected: "Connected. The phone is now the camera.",
  disconnected: "Phone disconnected.",
  failed: "Could not connect.",
};

export function AddCameraDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("internet");
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
        <button role="tab" aria-selected={tab === "internet"} className={`sketch ${tab === "internet" ? "is-on" : ""}`} onClick={() => setTab("internet")}>
          Phone (any network)
        </button>
        <button role="tab" aria-selected={tab === "system"} className={`sketch ${tab === "system" ? "is-on" : ""}`} onClick={() => setTab("system")}>
          USB / system camera
        </button>
      </div>
      {/* Kept mounted on the other tab, so the pairing code a phone may be scanning stays valid. */}
      <div hidden={tab !== "internet"}>
        <InternetPairing onDone={onClose} />
      </div>
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

/**
 * Closes the dialog a moment after the phone connects. `onDone` is read from a
 * ref: screens that redraw often (a running clock) pass a new function each
 * time, which must not restart the timer.
 */
function useCloseWhenConnected(status: PairingStatus, onDone: () => void) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (status !== "connected") return;
    const t = setTimeout(() => done.current(), 1200);
    return () => clearTimeout(t);
  }, [status]);
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
      <ol className="steps">
        <li>Scan the code with the phone's camera (or type the address into its browser).</li>
        <li>
          Tap <b>Start camera</b> on the phone and allow camera access.
        </li>
      </ol>
      <p className="muted">The phone's video passes through Cloudflare's tunnel, encrypted and not stored.</p>
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
