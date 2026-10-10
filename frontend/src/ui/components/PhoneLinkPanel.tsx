import { usePhoneLink } from "../../logic/usePhoneLink";

/** QR code for the phone to scan, plus the connection status. */
export function PhoneLinkPanel({ onUsePhone, usingPhone }: { onUsePhone: () => void; usingPhone: boolean }) {
  const phone = usePhoneLink();
  const s = phone.status;
  return (
    <div className="phone-link">
      {/* SVG comes from our own backend (qrcode crate), not user input. */}
      {phone.link && <div className="qr" dangerouslySetInnerHTML={{ __html: phone.link.qrSvg }} />}
      <div className="phone-info">
        <p>
          Scan with the phone camera, accept the security warning once, then press <b>Start camera</b>.
          Phone and laptop must be on the same Wi-Fi or hotspot.
        </p>
        {phone.link && (
          <p className="muted">
            {phone.link.url}
            <br />
            Pairing code <b>{phone.link.code}</b>
          </p>
        )}
        {phone.error ? (
          <p className="error">{phone.error}</p>
        ) : s?.connected ? (
          <p className="ok-text">
            Connected: {s.width}×{s.height} at {Math.round(s.fps)} fps
          </p>
        ) : (
          <p className="muted">{s?.listening ? "Waiting for the phone…" : "Starting the phone link…"}</p>
        )}
        <div className="row">
          <button className={usingPhone ? "active" : "primary"} onClick={onUsePhone}>
            {usingPhone ? "Using phone camera" : "Use phone camera"}
          </button>
          <button onClick={phone.newCode}>New code</button>
        </div>
      </div>
    </div>
  );
}
