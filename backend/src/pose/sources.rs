//! Pose sources fed from outside the engine thread.

use super::inbox::Inbox;
use super::{Landmark, PoseEstimator, PoseFrame, PoseSource};
use crate::phone::PhoneHub;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// How long to wait for a frame before reporting "nobody in view". The
/// engine keeps ticking, and a round in progress is voided as tracking lost.
const FRAME_WAIT: Duration = Duration::from_millis(250);

/// Camera frames from the phone link, turned into landmarks by an estimator.
pub struct PhoneSource {
    hub: Arc<PhoneHub>,
    estimator: Box<dyn PoseEstimator>,
    seen: u64,
    start: Instant,
    size: (u32, u32),
}

impl PhoneSource {
    pub fn new(hub: Arc<PhoneHub>, estimator: Box<dyn PoseEstimator>) -> Self {
        Self { hub, estimator, seen: 0, start: Instant::now(), size: (1280, 720) }
    }
}

impl PoseSource for PhoneSource {
    fn next_frame(&mut self) -> Result<PoseFrame, String> {
        let timestamp_ms = || self.start.elapsed().as_millis() as i64;
        let Some((seq, frame)) = self.hub.frames.take_newer(self.seen, FRAME_WAIT) else {
            return Ok(PoseFrame {
                timestamp_ms: timestamp_ms(),
                width: self.size.0,
                height: self.size.1,
                landmarks: None,
                preview_jpeg: None,
            });
        };
        self.seen = seq;
        self.size = (frame.width, frame.height);
        let landmarks = self.estimator.estimate(&frame.jpeg, frame.width, frame.height);
        Ok(PoseFrame {
            timestamp_ms: timestamp_ms(),
            width: frame.width,
            height: frame.height,
            landmarks,
            preview_jpeg: Some(frame.jpeg.to_vec()),
        })
    }
}

/// A pose frame computed by a tracker running in the frontend (e.g. the
/// MediaPipe JavaScript engine) and sent with the `push_pose_frame` command.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushedPoseFrame {
    pub width: u32,
    pub height: u32,
    pub landmarks: Option<Vec<Landmark>>,
}

/// Landmarks pushed from the frontend tracker.
pub struct PushedSource {
    inbox: Arc<Inbox<PushedPoseFrame>>,
    seen: u64,
    start: Instant,
}

impl PushedSource {
    pub fn new(inbox: Arc<Inbox<PushedPoseFrame>>) -> Self {
        Self { inbox, seen: 0, start: Instant::now() }
    }
}

impl PoseSource for PushedSource {
    fn next_frame(&mut self) -> Result<PoseFrame, String> {
        let pushed = self.inbox.take_newer(self.seen, FRAME_WAIT);
        let (width, height, landmarks) = match pushed {
            Some((seq, f)) => {
                self.seen = seq;
                (f.width, f.height, f.landmarks.filter(|l| l.len() == super::LANDMARK_COUNT))
            }
            None => (1280, 720, None),
        };
        Ok(PoseFrame { timestamp_ms: self.start.elapsed().as_millis() as i64, width, height, landmarks, preview_jpeg: None })
    }
}
