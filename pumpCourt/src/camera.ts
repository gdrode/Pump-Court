// Camera access: listing devices, opening a stream, remembering the choice.

const STORAGE_KEY = 'pumpcourt.cameraId'
export const REQUESTED_FPS = 30

export function loadSavedCameraId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveCameraId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Private window or blocked storage: the picker still works for this session.
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput')
}

export async function openCamera(deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: REQUESTED_FPS },
  }
  if (deviceId) video.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

export function streamSettings(stream: MediaStream) {
  return stream.getVideoTracks()[0]?.getSettings() ?? {}
}
