//! Pose sources fed from outside the engine thread.
//!
//! The tracker runs in the frontend (MediaPipe JavaScript). It sends each
//! frame's landmarks with the `push_pose_frame` command into an [`Inbox`],
//! and these sources hand them to the engine.

use super::inbox::Inbox;
use super::{Landmark, PoseFrame, PoseSource, LANDMARK_COUNT};
use crate::phone::PhoneHub;
use serde::Deserialize;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// How long to wait for a frame before reporting "nobody in view". The
/// engine keeps ticking, and a round in progress is voided as tracking lost.
const FRAME_WAIT: Duration = Duration::from_millis(250);

/// Landmarks older than this are not matched to a new phone frame.
const MAX_LANDMARK_AGE: Duration = Duration::from_millis(250);

/// A pose frame computed by the frontend tracker and sent with `push_pose_frame`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushedPoseFrame {
    pub width: u32,
    pub height: u32,
    pub landmarks: Option<Vec<Landmark>>,
}

/// Keeps only a full set of 33 landmarks.
fn valid(landmarks: Option<Vec<Landmark>>) -> Option<Vec<Landmark>> {
    landmarks.filter(|l| l.len() == LANDMARK_COUNT)
}

/// Phone camera over the QR link.
///
/// Paced by the phone's frames, which are also the on-screen preview. The
/// frontend tracker receives the same frames (`subscribe_phone_frames`) and
/// pushes landmarks back; each phone frame is paired with the newest ones.
pub struct PhoneSource {
    hub: Arc<PhoneHub>,
    pushed: Arc<Inbox<PushedPoseFrame>>,
    seen_frame: u64,
    seen_pose: u64,
    latest_pose: Option<(Instant, Option<Vec<Landmark>>)>,
    start: Instant,
    size: (u32, u32),
}

impl PhoneSource {
    pub fn new(hub: Arc<PhoneHub>, pushed: Arc<Inbox<PushedPoseFrame>>) -> Self {
        Self { hub, pushed, seen_frame: 0, seen_pose: 0, latest_pose: None, start: Instant::now(), size: (1280, 720) }
    }
}

impl PoseSource for PhoneSource {
    fn next_frame(&mut self) -> Result<PoseFrame, String> {
        let frame = self.hub.frames.take_newer(self.seen_frame, FRAME_WAIT);
        // Pick up anything the tracker sent meanwhile (never blocks).
        if let Some((seq, pose)) = self.pushed.take_newer(self.seen_pose, Duration::ZERO) {
            self.seen_pose = seq;
            self.latest_pose = Some((Instant::now(), valid(pose.landmarks)));
        }
        let landmarks = self
            .latest_pose
            .as_ref()
            .filter(|(at, _)| at.elapsed() <= MAX_LANDMARK_AGE)
            .and_then(|(_, l)| l.clone());
        let preview_jpeg = frame.map(|(seq, f)| {
            self.seen_frame = seq;
            self.size = (f.width, f.height);
            f.jpeg.to_vec()
        });
        Ok(PoseFrame {
            timestamp_ms: self.start.elapsed().as_millis() as i64,
            width: self.size.0,
            height: self.size.1,
            // No phone frame for a while means nobody is being tracked.
            landmarks: preview_jpeg.as_ref().and(landmarks),
            preview_jpeg,
        })
    }
}

/// Laptop camera: the frontend tracker owns the camera and pushes landmarks.
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
                (f.width, f.height, valid(f.landmarks))
            }
            None => (1280, 720, None),
        };
        Ok(PoseFrame { timestamp_ms: self.start.elapsed().as_millis() as i64, width, height, landmarks, preview_jpeg: None })
    }
}
