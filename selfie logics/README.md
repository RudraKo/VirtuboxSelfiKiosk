# Selfie Logic Test Runbook

Use this checklist before the event to validate the full path:
photo capture -> crop/compress -> upload -> Sheet write -> kiosk polling/reveal.

## Pre-flight

- Open the local harness: [HowT0Add/main.html](HowT0Add/main.html)
- Paste the current Apps Script `/exec` URL into the URL field.
- Load a real phone photo and verify crop preview works.
- Confirm the live spreadsheet tab name matches the code in `appscriptLogics.js`.
- Confirm the kiosk device is pointed at the live `doGet` endpoint.

## Smoke Test

- [ ] Load a photo in the harness.
- [ ] Click `Crop and preview` and confirm the compressed preview appears.
- [ ] Click `Submit photo` and confirm the Apps Script response is `ok: true`.
- [ ] Confirm one new row appears in the Sheet.
- [ ] Confirm the Drive image URL opens in a browser.
- [ ] Confirm the kiosk eventually displays the row.

## Codeable Fixes

These are the items that can be addressed in code if you want to harden the system before the event.
Auth is not required for this event, so that item is intentionally excluded.

- [x] Duplicate protection for near-simultaneous uploads using `uploadID` lock + idempotency check.
- [x] Kiosk rows that fail to load remain pending instead of being skipped.
- [ ] Persist kiosk cursor across refresh or power loss.
- [ ] Add explicit client-side validation for required guest fields if name/phone are mandatory.
- [ ] Add clearer failure UX when all retries fail on poor network.
- [ ] Add HEIC and EXIF-orientation handling or a documented fallback.
- [ ] Add moderation / takedown support before public display.
- [ ] Add a strategy for Drive 403s and other permanently broken image URLs.
- [ ] Add a safer cursor strategy if Sheet rows are ever edited, sorted, or deleted during the event.

## Edge Cases to Test

### Upload / Guest Phone

- [ ] Guest closes the tab or backgrounds the app mid-upload.
  - Expected: upload either fails cleanly or completes once retry resumes; no silent hang.
- [ ] iPhone photo arrives as HEIC.
  - Expected: crop/compress either succeeds or fails with a clear message; note browser compatibility.
- [ ] Photo has EXIF rotation metadata.
  - Expected: image orientation is correct after crop, or the issue is documented as a limitation.
- [ ] Guest denies camera permission or has no camera.
  - Expected: gallery upload still works, or the UI shows a useful fallback path.
- [ ] Guest selects a corrupted or non-image file.
  - Expected: upload is blocked with a clear error.
- [ ] Guest submits empty name/phone if those fields are required.
  - Expected: validation blocks submission, or the app explicitly allows blanks.
- [ ] Two guests submit at the exact same moment.
  - Expected: only one row per `uploadID`; if duplicates appear, treat as a bug.
- [ ] Network is bad enough that all 4 retries fail.
  - Expected: harness shows a clear failure state and the user is told to try again.

### Apps Script Backend

- [ ] Two near-simultaneous requests use the same `uploadID`.
  - Expected: only one row is written; note that a tight race can still expose a duplicate if the lock is missing.
- [ ] Sudden burst hits Apps Script concurrent-execution limits.
  - Expected: failures are visible and recoverable; no data corruption.
- [ ] Drive folder approaches capacity.
  - Expected: uploads fail clearly and the event team is alerted.
- [ ] Someone manually edits/sorts/deletes rows in the Sheet while live.
  - Expected: cursor behavior is understood as broken; use only if you accept replay risk.
- [ ] Malformed or incomplete JSON is posted to `doPost`.
  - Expected: request is rejected with a clear error.
- [ ] Sheet becomes very large over the event.
  - Expected: `doGet` still returns the delta, but you should watch for latency.

### Kiosk Display

- [ ] Kiosk browser crashes or refreshes.
  - Expected: decide whether replay-from-start is acceptable; current cursor is memory-only unless you persist it.
- [ ] Kiosk loses power mid-event.
  - Expected: on restart, it resumes from the chosen cursor strategy.
- [ ] Uploads arrive faster than the reveal pace.
  - Expected: backlog grows in queue; no skipped rows.
- [ ] Drive sharing is wrong and an image URL returns 403.
  - Expected: row stays pending and a visible error is logged.
- [ ] Browser tab loses focus, sleeps, or screensaver kicks in.
  - Expected: kiosk polling/reveal still behaves as expected after wake.

### Content / Moderation

- [ ] Inappropriate image is uploaded.
  - Expected: decide whether the event accepts no-moderation risk or needs a review queue.
- [ ] A photo must be removed after display.
  - Expected: verify whether any takedown workflow exists; currently it does not.
- [ ] Important content gets cropped out by the frame ratio.
  - Expected: either adjust crop settings or accept the framing loss.

### Operational / Event Day

- [ ] Anyone with the QR URL can post without being onsite.
  - Expected: this is an accepted risk for this event since auth is not required.
- [ ] Venue Wi-Fi hits its data cap.
  - Expected: uploads/reveal degrade visibly, not silently.
- [ ] Event owner edits the Sheet by mistake.
  - Expected: spreadsheet permissions should prevent this; if not, fix access before going live.

## Go / No-Go Rules

- Go if: smoke test passes, duplicate-ID test passes, delta fetch works, kiosk render works, and no blocker exists in the kiosk refresh/pending logic.
- No-go if: uploads silently fail, duplicates are created in a tight race, kiosk replays unexpectedly after refresh, or moderation/takedown is required but unavailable.

## Notes

- Current live upload path uses retry/backoff and idempotency on `uploadID`.
- Current kiosk behavior keeps failed image rows pending instead of skipping them.
- Current kiosk cursor is memory-only unless you add persistence.
