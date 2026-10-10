import { useEffect, useState } from "react";
import { backend, errorText, events } from "../api/backend";
import type { PhoneLink } from "../api/types";
import { useBackendEvent } from "./events";

/** Phone camera link: the QR code to scan and the live connection status. */
export function usePhoneLink() {
  const [link, setLink] = useState<PhoneLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.getPhoneLink().then(setLink).catch((e) => setError(errorText(e)));
    // The frame rate isn't pushed as an event, so refresh it now and then.
    const poll = setInterval(() => backend.getPhoneLink().then(setLink).catch(() => {}), 2000);
    return () => clearInterval(poll);
  }, []);
  useBackendEvent(events.onPhoneStatus, (status) => setLink((l) => (l ? { ...l, status } : l)));

  return {
    link,
    status: link?.status ?? null,
    error: error ?? link?.status.error ?? null,
    /** Invalidates the old QR code and disconnects the current phone. */
    newCode: async () => setLink(await backend.newPairingCode()),
  };
}
