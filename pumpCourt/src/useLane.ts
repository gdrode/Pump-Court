// One player's lane: their camera, their own pose tracker, and the frame loop
// that turns video into angles and posture. App.tsx runs one lane per player
// and receives every processed frame through `onFrame`.
import { useEffect, useRef, useState } from 'react'
import { openCamera, saveCameraId, stopStream, streamSettings } from './camera'
import { drawOverlay } from './draw'
import { getLandmarker, MODEL, type LoadedLandmarker } from './landmarker'
import { createSideTracker, type Landmark, type PoseAngles } from './pose'
import { createPostureTracker, type Posture } from './posture'

/** Camera choice: a device the OS provides, or a paired phone. */
export type SourceKey = `dev:${string}` | `phone:${string}`

export interface LaneFrame {
  ts: number
  angles: PoseAngles | null
  posture: Posture
}

export interface LaneStats {
  cameraFps: number | null
  detectFps: number | null
  detectMs: number | null
}

interface Options {
  /** 0 for player 1, 1 for player 2. Each slot gets its own landmarker. */
  slot: number
  /** Off = no camera, no model, no loop (e.g. player 2 in single-player). */
  enabled: boolean
  source: SourceKey | null
  /** With no source chosen, open the default camera (player 1 only). */
  openDefault: boolean
  /** The paired phone's stream when `source` is a phone. */
  phoneStream: MediaStream | null
  onFrame(f: LaneFrame): void
  /** Called after a camera opens, so device labels can be refreshed. */
  onCameraOpened?(): void
}

export function useLane({ slot, enabled, source, openDefault, phoneStream, onFrame, onCameraOpened }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Count of frames the video element has actually shown. A disconnected phone
  // leaves currentTime ticking over a frozen frame, so this is the honest
  // "is there a new frame" signal. -1 when the browser can't report it.
  const presentedRef = useRef(-1)
  const onFrameRef = useRef(onFrame)
  const onOpenedRef = useRef(onCameraOpened)
  useEffect(() => { onFrameRef.current = onFrame; onOpenedRef.current = onCameraOpened })

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [deliveredFps, setDeliveredFps] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [hasVideo, setHasVideo] = useState(false)
  const [model, setModel] = useState<LoadedLandmarker | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)
  // Set when the GPU delegate starts failing mid-session; the model is rebuilt on CPU.
  const [cpuOnly, setCpuOnly] = useState(false)
  const [stats, setStats] = useState<LaneStats>({ cameraFps: null, detectFps: null, detectMs: null })
  const [liveAngles, setLiveAngles] = useState<PoseAngles | null>(null)
  const [livePosture, setLivePosture] = useState<Posture | null>(null)

  // --- Camera ----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const video = videoRef.current
    if (!video) return
    setCameraError(null)
    setDeliveredFps(null)
    const isPhone = !!source?.startsWith('phone:')
    const show = async (stream: MediaStream) => {
      video.srcObject = stream
      await video.play().catch(() => {})
      setHasVideo(true)
      // A phone's track settings describe the network stream, not its camera.
      setDeliveredFps(isPhone ? null : streamSettings(stream).frameRate ?? null)
    }
    // Read the size from the video itself, which follows a phone's stream as its quality adapts.
    const onResize = () => setResolution(video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '')
    video.addEventListener('resize', onResize)
    const clear = () => {
      stopStream(streamRef.current)
      streamRef.current = null
      video.srcObject = null
      setHasVideo(false)
    }

    if (!enabled || (!source && !openDefault)) {
      clear()
    } else if (isPhone) {
      stopStream(streamRef.current)
      streamRef.current = null
      if (phoneStream) void show(phoneStream)
      else clear()
    } else {
      const wanted = source?.startsWith('dev:') ? source.slice(4) : null
      ;(async () => {
        try {
          let stream: MediaStream
          try {
            stream = await openCamera(wanted)
          } catch (err) {
            // A saved camera may be unplugged; fall back to the default one.
            if (wanted && (err as DOMException).name === 'OverconstrainedError') stream = await openCamera(null)
            else throw err
          }
          if (cancelled) { stopStream(stream); return }
          stopStream(streamRef.current)
          streamRef.current = stream
          await show(stream)
          const id = streamSettings(stream).deviceId ?? null
          setActiveDeviceId(id)
          if (slot === 0 && id) saveCameraId(id)
          onOpenedRef.current?.()
        } catch (err) {
          if (!cancelled) setCameraError(`${(err as Error).name}: ${(err as Error).message}`)
        }
      })()
    }
    return () => {
      cancelled = true
      video.removeEventListener('resize', onResize)
    }
  }, [enabled, source, openDefault, phoneStream, slot])

  useEffect(() => () => stopStream(streamRef.current), [])

  // --- Model (one per lane, created once, never in the loop) ----------------
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setModel(null)
    setModelError(null)
    getLandmarker(MODEL, cpuOnly, slot).then(
      (m) => { if (!cancelled) setModel(m) },
      (err) => {
        if (cancelled) return
        const webgl = /activeTexture|Aborted|WebGL/i.test(String(err))
        setModelError(webgl ? `pose tracking needs WebGL, which this browser could not start. Use Chrome with hardware acceleration on. (${err})` : String(err))
      },
    )
    return () => { cancelled = true }
  }, [enabled, cpuOnly, slot])

  // --- Camera frame rate, measured independently of detection --------------
  useEffect(() => {
    const video = videoRef.current
    if (!video || !('requestVideoFrameCallback' in video)) return
    // Count frames from presentedFrames rather than callbacks: callbacks are
    // skipped while detection blocks the main thread, presented frames are not.
    let since = performance.now(), sinceFrames = -1, handle = 0, alive = true
    const onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return
      presentedRef.current = meta.presentedFrames
      const now = performance.now()
      if (sinceFrames < 0 || meta.presentedFrames < sinceFrames) {
        since = now; sinceFrames = meta.presentedFrames
      } else if (now - since >= 1000) {
        const fps = ((meta.presentedFrames - sinceFrames) * 1000) / (now - since)
        setStats((s) => ({ ...s, cameraFps: fps }))
        since = now; sinceFrames = meta.presentedFrames
      }
      handle = video.requestVideoFrameCallback(onVideoFrame)
    }
    handle = video.requestVideoFrameCallback(onVideoFrame)
    return () => { alive = false; video.cancelVideoFrameCallback(handle) }
  }, [])

  // --- Detection loop -------------------------------------------------------
  useEffect(() => {
    if (!model || !enabled) return
    const video = videoRef.current!
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const tracker = createSideTracker()
    const posture = createPostureTracker()
    let raf = 0
    let lastVideoTime = -1
    let lastPresented = -1
    let lastTs = 0
    let detections = 0, detectMsSum = 0, since = performance.now(), lastUi = 0
    let failures = 0
    let lastFrameAt = performance.now(), cleared = false

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const presented = presentedRef.current
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]
      const live = !!track && track.readyState === 'live' && !track.muted
      const fresh = presented >= 0 ? presented !== lastPresented : video.currentTime !== lastVideoTime
      if (video.readyState < 2 || !fresh || !live || !video.videoWidth) {
        // A stalled camera (e.g. a phone dropping out) must not leave a frozen skeleton behind,
        // and the player counts as out of position.
        if (!cleared && performance.now() - lastFrameAt > 500) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          cleared = true
          setStats((st) => ({ ...st, detectFps: 0, detectMs: null }))
          detections = 0; detectMsSum = 0; since = performance.now()
          const ts = Math.max(performance.now(), lastTs + 0.001)
          lastTs = ts
          const pos = posture.update(ts, null)
          setLivePosture(pos)
          setLiveAngles(null)
          onFrameRef.current({ ts, angles: null, posture: pos })
        }
        return
      }
      lastVideoTime = video.currentTime
      lastPresented = presented
      lastFrameAt = performance.now()
      cleared = false
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      // detectForVideo needs strictly increasing timestamps.
      const ts = Math.max(performance.now(), lastTs + 0.001)
      lastTs = ts
      const t0 = performance.now()
      let pose: Landmark[] | undefined
      try {
        pose = model.landmarker.detectForVideo(video, ts).landmarks[0]
      } catch (err) {
        if (++failures < 10) return
        cancelAnimationFrame(raf)
        console.error('Pose detection keeps failing', err)
        if (model.delegate === 'GPU') setCpuOnly(true)
        else setModelError(`detection failed on CPU: ${(err as Error).message}`)
        return
      }
      failures = 0
      detectMsSum += performance.now() - t0
      detections++

      const angles = tracker.update(pose, video.videoWidth / video.videoHeight)
      drawOverlay(ctx, pose, angles ? angles.side : null)
      // Only a player in the push-up position, hands planted, is judged. Height is measured from the hands' floor line.
      const pos = posture.update(ts, angles)
      onFrameRef.current({ ts, angles, posture: pos })

      const now = performance.now()
      // The readouts update a few times a second, not every frame.
      if (now - lastUi > 250) {
        lastUi = now
        setLiveAngles(angles)
        setLivePosture(pos)
      }
      if (now - since >= 1000) {
        // Read the counters now: the updater runs later, after they are reset.
        const detectFps = (detections * 1000) / (now - since)
        const detectMs = detections ? detectMsSum / detections : null
        setStats((s) => ({ ...s, detectFps, detectMs }))
        detections = 0; detectMsSum = 0; since = now
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [model, enabled])

  return {
    videoRef, canvasRef, model, modelError, cameraError, deliveredFps, resolution, stats,
    liveAngles, livePosture, activeDeviceId, hasVideo,
  }
}

export type Lane = ReturnType<typeof useLane>
