// Creates the Pose Landmarker once. Wasm and model files are served from
// public/, so tracking makes no outside request.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export type ModelVariant = 'full' | 'heavy'

/** The model the app runs. 'full' is the most accurate model that keeps up with 30 fps on a laptop. 'heavy' is more accurate still but much slower; to try it, download pose_landmarker_heavy.task into public/models and change this. */
export const MODEL: ModelVariant = 'full'
export type Delegate = 'GPU' | 'CPU'

export interface LoadedLandmarker {
  landmarker: PoseLandmarker
  variant: ModelVariant
  delegate: Delegate
}

const cache = new Map<string, Promise<LoadedLandmarker>>()

async function make(variant: ModelVariant, delegate: Delegate, numPoses: number) {
  const vision = await FilesetResolver.forVisionTasks('/wasm')
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `/models/pose_landmarker_${variant}.task`, delegate },
    runningMode: 'VIDEO',
    numPoses,
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

async function create(variant: ModelVariant, cpuOnly: boolean, numPoses: number): Promise<LoadedLandmarker> {
  if (!cpuOnly) {
    try {
      return { landmarker: await make(variant, 'GPU', numPoses), variant, delegate: 'GPU' }
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err)
    }
  }
  return { landmarker: await make(variant, 'CPU', numPoses), variant, delegate: 'CPU' }
}

/**
 * Returns the same landmarker for a variant every time, so it is never rebuilt
 * in the frame loop. `slot` gives each camera its own instance: VIDEO mode
 * tracks a body from frame to frame, so two streams must not share one.
 * `numPoses`: how many people it looks for (the app uses several and picks
 * one, see person.ts; the prototype uses 1).
 */
export function getLandmarker(variant: ModelVariant, cpuOnly = false, slot = 0, numPoses = 1): Promise<LoadedLandmarker> {
  const key = `${variant}/${cpuOnly ? 'cpu' : 'auto'}/${slot}/${numPoses}`
  let p = cache.get(key)
  if (!p) {
    p = create(variant, cpuOnly, numPoses)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
