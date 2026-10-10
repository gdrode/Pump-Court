//! A "latest value wins" mailbox between threads.
//!
//! One side `put`s values (a network task, a Tauri command); the engine
//! thread `take_newer`s them, blocking until something new arrives. Old
//! values are dropped, never queued: for live video only the newest frame
//! matters, and a queue would just add lag.

use std::sync::{Condvar, Mutex};
use std::time::Duration;

pub struct Inbox<T> {
    slot: Mutex<(u64, Option<T>)>,
    ready: Condvar,
}

impl<T: Clone> Inbox<T> {
    pub fn new() -> Self {
        Self { slot: Mutex::new((0, None)), ready: Condvar::new() }
    }

    /// Stores a new value and wakes the reader. Returns its sequence number.
    pub fn put(&self, value: T) -> u64 {
        let mut slot = self.slot.lock().unwrap();
        slot.0 += 1;
        slot.1 = Some(value);
        self.ready.notify_all();
        slot.0
    }

    /// Waits up to `timeout` for a value newer than `seen`.
    /// Returns the value and its sequence number, or `None` on timeout.
    pub fn take_newer(&self, seen: u64, timeout: Duration) -> Option<(u64, T)> {
        let slot = self.slot.lock().unwrap();
        let (slot, _) = self.ready.wait_timeout_while(slot, timeout, |s| s.0 <= seen).unwrap();
        (slot.0 > seen).then(|| (slot.0, slot.1.clone().expect("sequence > 0 means a value was put")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn keeps_only_the_newest() {
        let inbox = Inbox::new();
        inbox.put(1);
        inbox.put(2);
        assert_eq!(inbox.take_newer(0, Duration::ZERO), Some((2, 2)));
        assert_eq!(inbox.take_newer(2, Duration::from_millis(10)), None);
    }

    #[test]
    fn wakes_a_waiting_reader() {
        let inbox = Arc::new(Inbox::new());
        let writer = inbox.clone();
        let t = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            writer.put("frame");
        });
        assert_eq!(inbox.take_newer(0, Duration::from_secs(2)), Some((1, "frame")));
        t.join().unwrap();
    }
}
