import { usePhoneLink } from "../../logic/usePhoneLink";

/** QR code for the phone to scan, plus the connection status. */
export function PhoneLinkPanel({ onUsePhone, usingPhone }: { onUsePhone: () => void; usingPhone: boolean }) {
  const phone = usePhoneLink();
  const s = phone.status;
  return (
    <div className="phone-link sketch">
      {/* SVG comes from our own backend (qrcode crate), not user input. */}
      {phone.link?.qrSvg && <div className="qr" dangerouslySetInnerHTML={{ __html: phone.link.qrSvg }} />}
      <div className="phone-info">
        <p>
          Scan with the phone, accept the security warning once, then press <b>Start camera</b>. Phone and laptop must be
          on the same Wi-Fi or hotspot.
        </p>
        {phone.link && (
          <>
            <p className="code">{phone.link.code}</p>
            <p className="muted">
              Single-use: the code changes as soon as a phone pairs, so the next person scans the new one (and takes over
              the camera).
            </p>
          </>
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
        <div className="seg">
          <button type="button" className={`seg__btn sketch ${usingPhone ? "is-on" : ""}`} onClick={onUsePhone}>
            {usingPhone ? "Using phone camera" : "Use phone camera"}
          </button>
          <button type="button" className="seg__btn sketch" onClick={phone.newCode}>
            New code
          </button>
        </div>
      </div>
    </div>
  );
}
