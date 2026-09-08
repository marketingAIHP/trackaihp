# Employee location timeline investigation — 8 September 2026

**Diagnosis: LOCATION TIMELINE STORAGE IS NOT WORKING as the required complete raw GPS history.** Some database writes demonstrably succeed, but the pre-fix collector intentionally discards valid observations. This is a partial collection failure, not an empty or unavailable table. The reported six-row PDF also contradicts the stored events. End-to-end operation of the repaired Android app is **not yet physically verified**.

Database: Track AIHP (`aoeecdautvfcbocsjqvv`). Employee: Test Test, ID **36**. Initial read: **2026-09-08T05:37:43.379Z**. Database queries were performed using existing authorized CLI/project access. Credentials are not included in evidence or source files.

## Actual newest three attendances

All times below are IST (UTC+05:30). Counts are database records, not PDF rows.

| Attendance | Check-in | Checkout | Raw rows | GPS observation rows | First event | Last event | Logical/PDF rows |
|---|---|---|---:|---:|---|---|---:|
| 1103 | 4 Sep 13:29:07.756 | 4 Sep 22:29:07.756 | **4** | **3** | location_update, 13:29:08.290 | auto_checkout, 22:29:07.756 | 3 |
| 1055 | 1 Sep 12:31:48.600 | 1 Sep 21:31:48.600 | **26** | **24** | check_in, 12:31:48.600 | auto_checkout, 21:31:48.600 | 8 |
| 1038 | 31 Aug 12:47:12.236 | 31 Aug 21:47:12.236 | **2** | **0** | check_in, 12:47:12.236 | auto_checkout, 21:47:12.236 | 2 |

| Raw event type | 1103 | 1055 | 1038 |
|---|---:|---:|---:|
| check_in | 0 | 1 | 1 |
| location_update | 2 | 16 | 0 |
| movement | 0 | 2 | 0 |
| site_departure | 1 | 3 | 0 |
| site_arrival | 0 | 2 | 0 |
| unknown_location | 0 | 1 | 0 |
| check_out (manual) | 0 | 0 | 0 |
| auto_checkout | 1 | 1 | 1 |
| **Total** | **4** | **26** | **2** |

`site_transition`, `unknown`, and `checkout` are not literal event types in this schema. Their implemented equivalents are shown above. All three attendance checkout types are auto_checkout; each deadline is exactly check-in plus nine hours.

Rejected-event counts/reasons for **each** historical attendance: **unavailable**, not zero. Client callback logs and retry storage from these dates were not supplied. Rejected observations were not recorded in a historical rejection table. GPS callbacks, attempted writes, and failed writes cannot be reconstructed from successful database rows.

Raw evidence, including every row ID, attendance/employee ID, original stored event_time, created_at, latitude, longitude, accuracy, site_id, location_name, site name, and idempotency_key: [local JSON](tmp/timeline-database-evidence.json). This GPS evidence is excluded from source control.

Latest attendance 1103, complete event list:

| Row | Event time (IST) | Insert time (IST) | Event | Site | GPS accuracy |
|---|---|---|---|---|---|
| 719 | 13:29:08.290 | 13:29:15.963797 | location_update | AIHP Tower | null |
| 720 | 13:29:10.052 | 13:29:16.301663 | location_update | AIHP Tower | 7.607 m |
| 733 | 20:43:41.867 | 20:43:47.977533 | site_departure | null | null |
| 734 | 22:29:07.756 | 22:30:00.029373 | auto_checkout | null | null |

Row 733 has coordinates 28.4941952, 77.095182 and is stored as a departure, not AIHP Tower. Its key is `36:1103:site_departure:2026-09-04T15:13:41.867Z:28.49420,77.09518`. Therefore Case C (every observation forced to AIHP Tower) does not describe all these records.

For attendance 1055, row 519 preserves event_time **18:04:46.420** while created_at is **18:38:27.431516**, demonstrating a delayed historical insert. This does not establish that every old foreground event_time was the original device timestamp: the old foreground code replaced it with upload time.

## Proven causes and pipeline trace

1. Native `locationAdapter.native.ts` preserves Expo's timestamp. `attendanceLocationManager` publishes fresh snapshots independently of its UI update threshold.
2. Foreground `LocationTrackingService` previously applied live-upload throttle/in-flight checks before calling the timeline observer. It substituted `new Date()` for the snapshot timestamp, dropped accuracy, and called history only after live-upload success.
3. Background `backgroundLocationTask` previously selected only the newest fix from an Android batch. Earlier fixes, cooldown skips, stale live-state fixes, and live-upload failures never reached history. Its successful-upload path used `void recordTimelineLocation`, allowing the task to finish before historical persistence completed.
4. `updateLiveLocation` updates current `location_tracking`. The background path actually calls `updateBackgroundLiveLocation`, a separate direct live-row API. Neither API itself records history. The legacy foregroundSender does not call history either, but its startup calls are in the commented-out legacy implementation; current public tracking entry points delegate to LocationTrackingService.
5. Most decisively, old `recordTimelineLocation` initialized event type to null, set a type only for a few logical transitions, and logged `CONSOLIDATE` for same-state fixes without inserting them. Direct Site A to Site B changes while logical state remained at_site were also omitted. Updating local state on every skipped fix did not preserve database history.
6. Old state and attendance context came from AsyncStorage; prior-session state was not reset based on attendance ID. Its insert helper overwrote state timestamps with Date.now. Stale context and out-of-order retries could influence classification. The actual historical AsyncStorage contents are unavailable.
7. The old retry array was truncated to **three entries**, discarded transient failures after **three attempts**, and did not queue attendance/site lookup failures or observations excluded before live-upload success. Concurrent read/modify/write queue operations could overwrite entries.
8. The existing idempotency key included the event timestamp; inspected rows do not show different timestamps collapsed into one key. The proven same-state omission occurred **before** upsert. New GPS keys are independent of classification and retain full coordinates plus normalized GPS time and resolved attendance ID.
9. Production had only the original auto-checkout observer. The September attendance boundary guard, check-in observer, and manual checkout observer were absent. Auto-checkout errors were swallowed by `exception when others then null`. This also explains why a local source file did not establish a deployed database safeguard. Attendance 1103 has no check_in timeline row.
10. `getLocationTimeline` formerly issued one unpaginated historical query and, when it returned no rows, synthesized report events from attendance boundaries. This fallback can produce exactly three At Site periods plus three Auto Checkout rows without demonstrating GPS tracking. It has been removed. Current employee/admin RLS policies were inspected; a transaction using the owning admin's authenticated SQL role could read all **32** rows.
11. Running the **pre-edit local projection** over those actual 32 rows produced **13** segments, not six. The unchanged PDF exporter now also renders 13 rows. The precise deployed build, auth state, query result, and cache that produced the user's described six-row PDF were not available, so the fallback is a reproduced code explanation, not a proven capture of that specific report invocation. It would be inaccurate to blame same-site consolidation in the PDF alone.

## Changes made

- `src/services/locationTimelineService.ts`: persist every supplied GPS observation in a durable per-fix AsyncStorage outbox before database lookups; retain failures without a three-item/three-attempt eviction rule; resolve attendance by GPS time; detect sites from current coordinates; preserve event_time/accuracy; confirm writes by returned database IDs; distinguish stored/duplicate/rejected/queued outcomes; recover legacy queued events; paginate history; remove attendance-only fallback; order terminal ties and prevent post-terminal segments.
- `src/services/LocationTrackingService.ts`: observe every delivered foreground snapshot before live throttle/in-flight checks; preserve GPS timestamp; capture accuracy; retry history on authenticated resume even after live tracking stops; clear obsolete attendance context when no new attendance ID is supplied.
- `src/services/backgroundLocationTask.ts`: durably enqueue every batched fix, in timestamp order, before live-state filtering; await outbox draining; retain observations when headless auth is unavailable. Reuse the original live-location path separately.
- `src/services/continuousLocationConfig.ts`: retain a timeline-only employee identity for delayed post-checkout batches; each fix still requires a matching attendance boundary.
- `supabase/migrations/202609080001_repair_timeline_observation_boundaries.sql`: forward-only repair installing missing guards/observers, inclusive GPS checkout boundary, idempotent single terminal, observable database warnings instead of silent failures. No new table/column and no historical DML.
- `tests/load-ts.cjs`, `tests/location-timeline.test.cjs`, `tests/location-tracking-paths.test.cjs`: tests of the actual TypeScript service and callback modules with controlled device/database adapters.
- `package.json`: `npm run test:timeline` command.
- `.gitignore`: exclude local GPS diagnostic/build artifacts; track the repair migration and this audit.
- `LOCATION_TIMELINE_AUDIT.md`: this report.

The PDF exporter, attendance deadline calculations, check-in/out business rules, overtime rules, geofence calculations, and notifications were not edited. History no longer depends on live-row upload success. Storage and live location are parallel consumers of GPS observations; report segmentation remains a read-only operation.

The new observation classification stores `site_arrival` for a directly detected site change, `site_departure` for leaving a known site, `movement` for an outside-site displacement of at least the existing 75 m threshold, and `unknown_location` for outside-site fixes without that movement evidence. It does not carry forward the old site. No GPS fixes were generated or inserted into production as a movement test.

## Database deployment and validation

Migration **202609080001 was applied and recorded** in the production migration ledger. The exact SQL first passed in a rolled-back transaction. Older manually deployed/unrecorded migrations were not mass-applied or relabeled. A future broad `db push --include-all` requires reconciling that pre-existing migration-ledger drift.

After application, the installed boundary function was tested on a **temporary table**, using attendance 1103's real boundary as the reference: a timestamp equal to checkout is accepted; one millisecond after checkout is rejected; an existing terminal suppresses a duplicate. The temporary-table transaction was rolled back. These are database-function tests, not a GPS journey test.

Post-repair counts are unchanged: **1038=2, 1055=26, 1103=4**. No historical attendance or timeline records were updated, deleted, or backfilled. Missing observations cannot be recovered from the current location_tracking row and were not reconstructed from it.

Evidence: `tmp/timeline-schema-evidence.json` (before), `tmp/timeline-schema-after.json`, `tmp/timeline-admin-rls-evidence.json`, `tmp/timeline-db-boundary-test.json`, `tmp/timeline-counts-after.json`, `tmp/timeline-migration-application.json`.

## Proof and limits

| Measurement | Existing real sessions | Controlled stationary software test |
|---|---:|---:|
| GPS callbacks generated | unavailable | 72 supplied observations |
| Timeline write attempts | unavailable | 72 |
| Successful writes | 32 surviving raw events; total attempts unknown | 72 mock database confirmations |
| Rejected writes | unavailable | 0 |
| Stored GPS observations | 27 | 72 mock rows |
| Stored raw events including boundaries | 32 | 72 mock rows |
| Logical segments | 13 | 1 |
| Regenerated PDF rows | 13 | not generated |

The 32 historical events include two check_ins, 27 GPS-related events, and three auto_checkouts. They do not prove uninterrupted tracking. In particular, attendance 1038 has no intermediate GPS history. There is no stored Site B arrival in these three sessions; a Site A → Site B physical journey was not manufactured.

Automated suite: **15 tests pass**. Cases cover stationary storage, idempotency, direct site change, leaving site/unknown location, late uploads, inclusive checkout, invalid timestamps, overtime/stale context, prolonged network failures, concurrent outbox enqueueing, out-of-order uploads, terminal uniqueness, >1000 report records, no fallback, foreground callbacks, and awaited background batches. TypeScript passes. Android Metro/Hermes export also passed (1,829 modules); this validates bundling, not native GPS behavior.

[Regenerated PDF](output/pdf/Test-Test-existing-timeline-audit.pdf): generated from the actual stored events through the current timeline service and the unchanged PDF exporter. It has **13 rows, three daily tables, four Travelling rows, and one Unknown Location row**. It was text-checked and rendered with PyMuPDF (Poppler was not installed); the rendered page was visually inspected. No coordinate/address/attendance-ID columns appear. This is a historical replay, not a new physical test.

Foreground: patched callback-to-storage path is software-tested; historical rows cannot reliably identify app visibility. Background: patched batched task is software-tested; real OS scheduling is unverified. Locked screen: unverified. Overtime: session separation is software-tested, and existing attendance behavior is unchanged; there is no new physical overtime session. Post-checkout observations are rejected by both the repaired service and the installed database guard; valid late uploads are judged on GPS event_time.

No connected Android device was returned by repeated `adb devices -l` checks. No new attendance, foreground movement route, background movement route, locked-screen route, or device log capture could be performed. The app changes have **not** been installed or published to a device during this investigation. Only the scoped database repair is deployed.

## Remaining physical acceptance test

Connect the Android test phone with USB debugging enabled and install a build containing these changes. Enable `EXPO_PUBLIC_LOCATION_TIMELINE_DIAGNOSTICS=true` for that diagnostic build to include latitude/longitude in `[LocationTimeline]` logs; normal builds omit coordinates from diagnostic logs. Disable the flag after testing.

Start `adb logcat -v threadtime` capture to a local file. Create a NEW attendance, remain at Site A for 5–10 minutes, leave and travel outside, enter Site B and remain there, then checkout. Include foreground, background, and locked-screen periods with known wall-clock boundaries. Repeat separately if needed to isolate modes. Exercise offline buffering and a before-checkout GPS fix uploaded after checkout.

For that new attendance, compare RECEIVED, ATTEMPTED, STORED, DUPLICATE, REJECTED, and QUEUED log decisions with actual location_timeline rows (event_time versus created_at), detected site per fix, logical segments, and the generated daily PDF. Count unique fixes by GPS timestamp/coordinates/session; overlapping foreground and background delivery of the same fix should produce a duplicate acknowledgement, not an additional row. A QUEUED failure is not a successful database write.

The outbox retains failures, but successful recovery still requires usable authenticated connectivity and a later callback/resume. It drains at most 50 entries per invocation. Clearing app data/uninstalling can remove local pending observations. No claim of fully working foreground/background/locked-screen tracking should be made until the physical acceptance test is complete.

