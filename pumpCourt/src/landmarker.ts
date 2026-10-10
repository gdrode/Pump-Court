// Creates the Pose Landmarker once. Wasm and model files are served from
// public/, so tracking makes no outside request.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export type ModelVariant = 'lite' | 'full'
export type Delegate = 'GPU' | 'CPU'

export interface LoadedLandmarker {
  landmarker: PoseLandmarker
  variant: ModelVariant
  delegate: Delegate
}

const cache = new Map<string, Promise<LoadedLandmarker>>()

async function make(variant: ModelVariant, delegate: Delegate) {
  const vision = await FilesetResolver.forVisionTasks('/wasm')
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `/models/pose_landmarker_${variant}.task`, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
  // A delegate can be created and still fail on the first frame, so run one
  // detection on a blank frame here, where a failure can still fall back.
  const blank = document.createElement('canvas')
  blank.width = blank.height = 64
  try {
    landmarker.detectForVideo(blank, 1)
  } catch (err) {
    landmarker.close()
    throw err
  }
  return landmarker
}

async function create(variant: ModelVariant, cpuOnly: boolean): Promise<LoadedLandmarker> {
  if (!cpuOnly) {
    try {
      return { landmarker: await make(variant, 'GPU'), variant, delegate: 'GPU' }
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err)
    }
  }
  return { landmarker: await make(variant, 'CPU'), variant, delegate: 'CPU' }
}

/** Returns the same landmarker for a variant every time, so it is never rebuilt in the frame loop. */
export function getLandmarker(variant: ModelVariant, cpuOnly = false): Promise<LoadedLandmarker> {
  const key = `${variant}/${cpuOnly ? 'cpu' : 'auto'}`
  let p = cache.get(key)
  if (!p) {
    p = create(variant, cpuOnly)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
