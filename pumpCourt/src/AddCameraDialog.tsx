// "Add camera": pair a phone over Wi-Fi with a QR code, or pick up a camera
// the operating system already provides (USB, Continuity Camera, webcam apps).
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { newRoomCode, openPhoneLink, type PhoneLink, type PhoneStatus } from './phoneLink'

interface Props {
  onClose(): void
  /** A phone finished pairing. The link stays open for as long as the camera is in use. */
  onPhone(phone: { id: string; label: string; stream: MediaStream; link: PhoneLink }): void
  onRefreshDevices(): Promise<void>
  /** Name for the next phone, e.g. "Phone 3". */
  nextLabel: string
}

type Tab = 'wifi' | 'system' | 'bluetooth'

export function AddCameraDialog({ onClose, onPhone, onRefreshDevices, nextLabel }: Props) {
  const [tab, setTab] = useState<Tab>('wifi')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-head">
        <h2>Add camera</h2>
        <button className="small" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'wifi'} onClick={() => setTab('wifi')}>Phone over Wi-Fi</button>
        <button role="tab" aria-selected={tab === 'system'} onClick={() => setTab('system')}>USB / system camera</button>
        <button role="tab" aria-selected={tab === 'bluetooth'} onClick={() => setTab('bluetooth')}>Bluetooth</button>
      </div>
      {/* Kept mounted on other tabs, so the pairing code a phone may be scanning stays valid. */}
      <div hidden={tab !== 'wifi'}>
        <WifiPairing onPhone={onPhone} label={nextLabel} />
      </div>
      {tab === 'system' && <SystemCameras onRefresh={onRefreshDevices} onClose={onClose} />}
      {tab === 'bluetooth' && <BluetoothNote />}
    </dialog>
  )
}

interface LanInfo {
  addresses: { address: string; iface: string; label: string }[]
  bonjour: string | null
}

/** Seconds without any phone reaching the laptop before the troubleshooting list appears. */
const NO_VISIT_HINT_S = 12

function WifiPairing({ onPhone, label }: { onPhone: Props['onPhone']; label: string }) {
  const [lan, setLan] = useState<LanInfo | null>(null)
  const [host, setHost] = useState('')
  const [room] = useState(newRoomCode)
  const [status, setStatus] = useState<PhoneStatus | 'starting'>('starting')
  const [detail, setDetail] = useState('')
  const [visit, setVisit] = useState<string | null>(null)
  const [waitedS, setWaitedS] = useState(0)
  const [qr, setQr] = useState('')
  const handedOff = useRef(false)

  const loadLan = useCallback(() => {
    fetch('/api/lan', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: LanInfo) => {
        setLan(d)
        setHost((cur) => {
          const options = [...d.addresses.map((a) => a.address), ...(d.bonjour ? [d.bonjour] : [])]
          if (cur && options.includes(cur)) return cur
          if (options.includes(location.hostname)) return location.hostname
          return d.addresses[0]?.address ?? d.bonjour ?? ''
        })
      })
      .catch(() => setLan({ addresses: [], bonjour: null }))
  }, [])
  useEffect(loadLan, [loadLan])

  // Until a phone gets through, keep the address list fresh (e.g. the laptop just joined a hotspot).
  useEffect(() => {
    if (visit) return
    const id = setInterval(() => {
      setWaitedS((s) => s + 1)
    }, 1000)
    const refresh = setInterval(loadLan, 5000)
    return () => { clearInterval(id); clearInterval(refresh) }
  }, [visit, loadLan])

  // Open the pairing room. If the dialog closes before a phone connects, close it again.
  useEffect(() => {
    let stream: MediaStream | null = null
    const link = openPhoneLink(room, {
      onStatus: (s, d) => {
        setStatus(s)
        setDetail(d ?? '')
        if (s === 'connected' && stream && !handedOff.current) {
          handedOff.current = true
          onPhone({ id: room, label, stream, link })
        }
      },
      onStream: (s) => { stream = s },
      onVisit: (from) => setVisit(from || 'a phone'),
    })
    return () => { if (!handedOff.current) link.close() }
  }, [room, label, onPhone])

  const port = location.port || (location.protocol === 'https:' ? '443' : '80')
  const url = host ? `https://${host}:${port}/phone.html?room=${room}` : ''

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''))
  }, [url])

  const statusText: Record<typeof status, string> = {
    starting: 'Opening a pairing code…',
    waiting: 'Waiting for the phone to scan the code…',
    connecting: 'Phone found, connecting…',
    connected: 'Connected. The phone is now your camera.',
    disconnected: 'Phone disconnected.',
    failed: 'Could not connect.',
  }

  const chosen = lan?.addresses.find((a) => a.address === host)
  const firstThree = chosen ? chosen.address.split('.').slice(0, 3).join('.') : null

  return (
    <div className="dialog-body">
      <ol className="steps">
        <li>Put the phone on the <b>same network</b> as this laptop. A phone hotspot is the most reliable: venue and school Wi-Fi often block devices from seeing each other.</li>
        <li>Scan the code with the phone's camera. Safari warns that the connection is not private: tap <b>Show Details</b>, then <b>visit this website</b> (Chrome: <b>Advanced → Proceed</b>).</li>
        <li>Tap <b>Start camera</b> on the phone and allow camera access.</li>
      </ol>
      {lan && lan.addresses.length === 0 && (
        <p className="error">This laptop isn't on a network. Join Wi-Fi or a phone's hotspot; this list refreshes by itself.</p>
      )}
      {lan && (lan.addresses.length > 1 || lan.bonjour) && (
        <label className="num">
          Address in the code
          <select value={host} onChange={(e) => setHost(e.target.value)}>
            {lan.addresses.map((a) => <option key={a.address} value={a.address}>{a.address} ({a.iface}, {a.label})</option>)}
            {lan.bonjour && <option value={lan.bonjour}>{lan.bonjour} (by name: iPhones and Macs find it without the number)</option>}
          </select>
        </label>
      )}
      {url && (
        <div className="pair">
          {qr ? <img src={qr} width={240} height={240} alt={`QR code for ${url}`} /> : <div className="qr-placeholder" />}
          <div>
            <p className="pair-url">Or type into the phone's browser:<br /><code>{url}</code></p>
            <p className="pair-code">Code <b>{room}</b></p>
          </div>
        </div>
      )}
      {visit
        ? <p className="ok-text">✓ A phone reached this laptop ({visit}). {status === 'waiting' ? 'Now tap Start camera on the phone.' : ''}</p>
        : waitedS >= NO_VISIT_HINT_S && (
          <div className="trouble">
            <p><b>No phone has reached this laptop yet.</b> If the page never loads on the phone:</p>
            <ul className="steps">
              {firstThree && <li>On the phone, check its address: iPhone <i>Settings → Wi-Fi → ⓘ → IP Address</i>. It should start with <b>{firstThree}.</b> If not, the two are on different networks.</li>}
              <li>Using an iPhone hotspot? Turn on <i>Maximize Compatibility</i>, join it from this laptop, wait for the address above to change to one starting with <b>172.20.10.</b>, then scan again.</li>
              {lan?.bonjour && host !== lan.bonjour && <li>Try the <b>by name</b> address in the list above; it doesn't depend on the number.</li>}
              <li>Turn off any VPN on the laptop and the phone.</li>
              <li>Still nothing: use the <i>USB / system camera</i> tab (Continuity Camera or a webcam app with a cable).</li>
            </ul>
          </div>
        )}
      <p className={status === 'connected' ? 'ok-text' : status === 'failed' ? 'error' : 'hint'}>
        {statusText[status]} {detail}
      </p>
    </div>
  )
}

function SystemCameras({ onRefresh, onClose }: { onRefresh(): Promise<void>; onClose(): void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="dialog-body">
      <p>Cameras the computer already knows about appear in the camera list automatically. Connect one, then refresh:</p>
      <ul className="steps">
        <li><b>USB webcam:</b> plug it in.</li>
        <li><b>iPhone on a Mac (Continuity Camera):</b> same Apple ID, Wi-Fi and Bluetooth on, phone nearby and locked in landscape. It shows up as a camera on its own.</li>
        <li><b>Android or iPhone on Windows:</b> install a webcam app such as DroidCam or Camo on both the phone and the laptop; it adds a camera to the list.</li>
        <li><b>Phone by USB cable:</b> the same webcam apps support a cable connection, which gives the steadiest frame rate.</li>
      </ul>
      <div className="row">
        <button disabled={busy} onClick={async () => { setBusy(true); await onRefresh(); setBusy(false); onClose() }}>
          {busy ? 'Refreshing…' : 'Refresh camera list'}
        </button>
      </div>
    </div>
  )
}

function BluetoothNote() {
  return (
    <div className="dialog-body">
      <p>Bluetooth is too slow to carry live video (about 1–2 Mbit/s at best, and browsers can't receive a camera stream over it). Two ways to get the same result:</p>
      <ul className="steps">
        <li><b>iPhone + Mac:</b> Continuity Camera uses Bluetooth to find the phone, then sends the video over Wi-Fi. See <i>USB / system camera</i>.</li>
        <li><b>Any phone:</b> use <i>Phone over Wi-Fi</i>. With no Wi-Fi around, turn on the phone's hotspot and join it from the laptop.</li>
      </ul>
    </div>
  )
}
