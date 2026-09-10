import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHeadlessSupabaseClient, supabase } from './supabase';
import { calculateDistance, findNearestSiteWithinGeofence } from '../utils/geofence';
import type { Coordinates, WorkSite } from '../types';

export const TIMELINE_EVENT_TYPES = {
  check_in: 'check_in', location_update: 'location_update', site_arrival: 'site_arrival',
  site_departure: 'site_departure', unknown_location: 'unknown_location', movement: 'movement',
  check_out: 'check_out', auto_checkout: 'auto_checkout',
} as const;
export type TimelineEventType = keyof typeof TIMELINE_EVENT_TYPES;
export const TIMELINE_HEARTBEAT_MS = 5 * 60 * 1000;
export const TIMELINE_MOVEMENT_METERS = 75;
const REPORT_SITE_STABILITY_MS = 5 * 60 * 1000;
type TimelineInput = { employeeId: number; attendanceId?: number | null; eventType: TimelineEventType; coordinates?: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null; source?: string };
type Observation = Omit<TimelineInput, 'eventType'> & { coordinates: Coordinates; eventTime: string };
type Pending = { kind: 'observation'; input: Observation } | { kind: 'event'; input: TimelineInput };
export type TimelineSegment = {
  id: string; employee_id: number; attendance_id?: number | null; event_time: string; end_time?: string | null;
  event_type: 'at_site' | 'travelling' | 'unknown_location' | 'check_out' | 'auto_checkout';
  location_name: string; full_address?: string | null; site_id?: number | null; latitude?: number | null;
  longitude?: number | null; accuracy?: number | null; created_at: string;
};
type AttendanceBoundary = {
  id: number; employee_id: number; check_in_time: string; check_out_time?: string | null;
  checkout_type?: string | null;
};

// One durable key per fix avoids read/modify/write queue races between headless
// and foreground runtimes. Failed observations are never evicted after N retries.
const pendingPrefix = (employeeId: number) => `@timeline:pending:v2:${employeeId}:`;
const employeeWork = new Map<number, Promise<void>>();
const verboseDiagnostics = process.env.EXPO_PUBLIC_LOCATION_TIMELINE_DIAGNOSTICS === 'true';
export function logTimelineDiagnostic(input: Partial<TimelineInput>, storageDecision: string, storageReason: string, extra: Record<string, unknown> = {}) {
  console.log('[LocationTimeline]', JSON.stringify({
    employeeId: input.employeeId, attendanceId: input.attendanceId ?? null,
    gpsTimestamp: input.eventTime ?? null, uploadTimestamp: new Date().toISOString(),
    source: input.source ?? null, eventType: input.eventType ?? null,
    latitude: verboseDiagnostics ? input.coordinates?.latitude ?? null : undefined,
    longitude: verboseDiagnostics ? input.coordinates?.longitude ?? null : undefined,
    accuracy: input.accuracy ?? null, detectedSite: input.site ? { id: input.site.id, name: input.site.name } : null,
    previousState: null, newState: null, storageDecision, storageReason, ...extra,
  }));
}
function failure(input: Partial<TimelineInput>, error: any) {
  input = error?.timelineContext || input;
  logTimelineDiagnostic(input, 'QUEUED', 'WRITE_OR_LOOKUP_FAILED', {
    error: error?.message || String(error), supabaseCode: error?.code ?? null,
    supabaseMessage: error?.message ?? null,
  });
}
class InvalidObservation extends Error {}
function identity(input: Partial<TimelineInput>) {
  return [input.attendanceId ?? 'resolve', input.eventTime,
    input.coordinates?.latitude ?? '', input.coordinates?.longitude ?? ''].join(':');
}
function pendingKey(item: Pending) {
  return pendingPrefix(item.input.employeeId) + item.kind + ':' + (item.kind === 'event' ? item.input.eventType + ':' : '') + identity(item.input);
}
function serialize(employeeId: number, work: () => Promise<void>) {
  const next = (employeeWork.get(employeeId) || Promise.resolve()).then(work, work);
  employeeWork.set(employeeId, next);
  void next.finally(() => { if (employeeWork.get(employeeId) === next) employeeWork.delete(employeeId); }).catch(() => {});
  return next;
}
async function resolveAttendance(input: TimelineInput | Observation, client: SupabaseClient) {
  const eventAt = Date.parse(input.eventTime || '');
  if (!Number.isFinite(eventAt)) throw new InvalidObservation('TIMESTAMP_INVALID');
  let query = client.from('attendance').select('id, employee_id, check_in_time, check_out_time, checkout_type').eq('employee_id', input.employeeId);
  // Resolve using the fix time, not an AsyncStorage attendance left over from
  // another shift or the attendance that happens to be active at upload time.
  if (input.attendanceId != null) query = query.eq('id', input.attendanceId);
  else query = query.lte('check_in_time', input.eventTime!).order('check_in_time', { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  // Empty RLS results are indistinguishable from a session not synchronized
  // yet. Retain the fix for retry; never discard it as a successful write.
  if (!data) throw new Error('NO_MATCHING_ATTENDANCE_OR_AUTH_CONTEXT');
  if (eventAt < Date.parse(data.check_in_time)) throw new InvalidObservation('BEFORE_CHECK_IN');
  if (data.check_out_time && eventAt > Date.parse(data.check_out_time)) throw new InvalidObservation('AFTER_CHECKOUT');
  return data;
}
async function insert(input: TimelineInput, client: SupabaseClient, observation = false) {
  const attendance = await resolveAttendance(input, client);
  input = { ...input, attendanceId: attendance.id };
  const terminal = input.eventType === 'check_out' || input.eventType === 'auto_checkout';
  if (terminal) {
    const expected = attendance.checkout_type === 'auto_checkout' ? 'auto_checkout' : 'check_out';
    if (!attendance.check_out_time || Date.parse(input.eventTime!) !== Date.parse(attendance.check_out_time) || input.eventType !== expected) throw new InvalidObservation('TERMINAL_MISMATCH');
    const existing = await client.from('location_timeline').select('id').eq('attendance_id', attendance.id).in('event_type', ['check_out', 'auto_checkout']).limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) { logTimelineDiagnostic(input, 'DUPLICATE', 'EXISTING_TERMINAL'); return; }
  }
  const row = {
    employee_id: input.employeeId, attendance_id: attendance.id, event_time: input.eventTime,
    latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null,
    accuracy: input.accuracy ?? null, site_id: terminal ? null : input.site?.id ?? null,
    location_name: terminal || input.eventType === 'movement' || input.eventType === 'site_departure' ? '' : input.site?.name || 'Unknown Location',
    full_address: terminal ? null : input.site?.address ?? null, event_type: input.eventType,
    // Classification can change after a retry; identity must not depend on it.
    idempotency_key: terminal ? `terminal:${attendance.id}` : `${observation ? 'gps' : input.eventType}:${input.employeeId}:${identity(input)}`,
  };
  logTimelineDiagnostic(input, 'ATTEMPTED', 'DATABASE_UPSERT');
  const result = await client.from('location_timeline').upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id, event_time, created_at');
  if (result.error) throw Object.assign(result.error, { timelineContext: input });
  logTimelineDiagnostic(input, result.data?.length ? 'STORED' : 'DUPLICATE', result.data?.length ? 'DATABASE_CONFIRMED' : 'DUPLICATE_IDEMPOTENCY', { rowId: result.data?.[0]?.id ?? null, serverTimestamp: result.data?.[0]?.created_at ?? null });
}
async function processObservation(input: Observation, client: SupabaseClient) {
  const attendance = await resolveAttendance(input, client);
  input.attendanceId = attendance.id;
  const { data: sites, error } = await client.from('work_sites').select('id, name, address, latitude, longitude, geofence_radius, admin_id, is_active').eq('is_active', true);
  if (error) throw error;
  const site = findNearestSiteWithinGeofence(input.coordinates, (sites || []) as WorkSite[])?.site || null;
  // The predecessor belongs to this attendance and predates the GPS fix.
  // A late upload must never inherit a newer fix or another shift's state.
  const previousResult = await client.from('location_timeline').select('site_id, latitude, longitude, event_type, event_time').eq('attendance_id', attendance.id).lt('event_time', input.eventTime).not('latitude', 'is', null).order('event_time', { ascending: false }).limit(1).maybeSingle();
  if (previousResult.error) throw previousResult.error;
  const previous = previousResult.data;
  const distance = previous?.latitude != null && previous?.longitude != null ? calculateDistance(input.coordinates, previous) : 0;
  let eventType: TimelineEventType = 'location_update';
  if (site && previous && previous.site_id !== site.id) eventType = 'site_arrival';
  else if (!site && previous?.site_id != null) eventType = 'site_departure';
  else if (!site) eventType = distance >= TIMELINE_MOVEMENT_METERS ? 'movement' : 'unknown_location';
  const event = { ...input, site, eventType };
  logTimelineDiagnostic(event, 'CLASSIFIED', 'CURRENT_GPS', { previousState: previous ? segmentState(previous) : null, newState: segmentState({ event_type: eventType, site_id: site?.id }) });
  await insert(event, client, true);
}
async function processPending(key: string, item: Pending, client: SupabaseClient) {
  try {
    if (item.kind === 'observation') await processObservation(item.input, client);
    else await insert(item.input, client);
    await AsyncStorage.removeItem(key);
    return true;
  } catch (error: any) {
    // Checkout can close between the lookup and insert. Respect the database's
    // final boundary decision rather than letting one invalid fix block retries.
    if (error?.code === 'P0001' && /Location timeline event is after its attendance checkout/.test(error.message)) {
      logTimelineDiagnostic(error.timelineContext || item.input, 'REJECTED', 'AFTER_CHECKOUT');
      await AsyncStorage.removeItem(key);
      return true;
    }
    if (error instanceof InvalidObservation) {
      logTimelineDiagnostic(item.input, 'REJECTED', error.message);
      await AsyncStorage.removeItem(key);
      return true;
    } else { failure(item.input, error); return false; }
  }
}
async function drain(employeeId: number, client: SupabaseClient) {
  // Import the old queue without dropping its remaining events.
  const legacyKey = `@timeline:retry:${employeeId}`;
  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy) {
    for (const entry of JSON.parse(legacy)) {
      const item: Pending = { kind: 'event', input: entry.input };
      await AsyncStorage.setItem(pendingKey(item), JSON.stringify(item));
    }
    await AsyncStorage.removeItem(legacyKey);
  }
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(pendingPrefix(employeeId)));
  const entries = (await AsyncStorage.multiGet(keys)).flatMap(([key, raw]) => raw ? [{ key, item: JSON.parse(raw) as Pending }] : []);
  entries.sort((a, b) => Date.parse(a.item.input.eventTime!) - Date.parse(b.item.input.eventTime!));
  // Bound each headless invocation. Recover the oldest history while also
  // admitting current-session fixes so a large historical backlog cannot
  // starve today's attendance. Untouched entries remain durable.
  const batch = entries.length <= 50
    ? entries
    : [...entries.slice(0, 25), ...entries.slice(-25)];
  for (const { key, item } of batch) {
    if (!await processPending(key, item, client)) break;
  }
  if (entries.length > 50) logTimelineDiagnostic({ employeeId }, 'QUEUED', 'RETRY_BACKLOG', { remaining: entries.length - 50 });
}
export async function retryPendingTimelineEvents(employeeId: number, databaseClient: SupabaseClient = supabase) {
  try { await serialize(employeeId, () => drain(employeeId, databaseClient)); }
  catch (error) { failure({ employeeId }, error); }
}
async function persist(item: Pending, client: SupabaseClient, deferUpload = false) {
  const key = pendingKey(item);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(item));
    logTimelineDiagnostic(item.input, 'QUEUED', 'DURABLE_OUTBOX');
    if (!deferUpload) await serialize(item.input.employeeId, () => drain(item.input.employeeId, client));
  } catch (error: any) {
    logTimelineDiagnostic(item.input, 'FAILED', 'LOCAL_STORAGE_OR_PROCESSING_ERROR', { error: error?.message || String(error) });
  }
}
export async function recordTimelineEvent(input: TimelineInput) {
  await persist({ kind: 'event', input: { ...input, eventTime: input.eventTime || new Date().toISOString() } }, supabase);
}
export async function recordTimelineLocation(input: Observation & { databaseClient?: SupabaseClient; deferUpload?: boolean }) {
  const { databaseClient = supabase, deferUpload = false, ...observation } = input;
  logTimelineDiagnostic(observation, 'RECEIVED', 'GPS_OBSERVATION');
  if (!Number.isFinite(Date.parse(input.eventTime)) || !Number.isFinite(input.coordinates.latitude) || !Number.isFinite(input.coordinates.longitude) || Math.abs(input.coordinates.latitude) > 90 || Math.abs(input.coordinates.longitude) > 180) {
    logTimelineDiagnostic(input, 'REJECTED', 'TIMESTAMP_OR_COORDINATES_INVALID');
    return;
  }
  await persist({ kind: 'observation', input: { ...observation, eventTime: new Date(input.eventTime).toISOString() } }, databaseClient, deferUpload);
}

export async function getLocationTimeline(employeeId: number, from: string, to: string) {
  // On web the app's custom auth state can be ready before Supabase restores its
  // persisted session. Use the stored access token in that case so RLS evaluates
  // this report as the signed-in admin rather than as the anonymous role.
  const { data: { session } } = await supabase.auth.getSession();
  const client = session ? supabase : await createHeadlessSupabaseClient();
  const events: any[] = [];
  // A month of raw GPS observations exceeds PostgREST's single-page row cap.
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from('location_timeline').select('*, site:work_sites(name,address)')
      .eq('employee_id', employeeId).gte('event_time', from).lt('event_time', to)
      .order('event_time', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
    if (result.error) throw result.error;
    events.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) break;
  }
  const attendanceIds = [...new Set(events.map(event => event.attendance_id).filter((id): id is number => Number.isFinite(id)))];
  const attendance: AttendanceBoundary[] = [];
  // PostgREST URLs have practical size limits. Load only referenced sessions in
  // bounded chunks; this makes the report projection authoritative without
  // changing or repairing historical rows.
  for (let offset = 0; offset < attendanceIds.length; offset += 200) {
    const result = await client.from('attendance')
      .select('id, employee_id, check_in_time, check_out_time, checkout_type')
      .eq('employee_id', employeeId)
      .in('id', attendanceIds.slice(offset, offset + 200));
    if (result.error) throw result.error;
    attendance.push(...((result.data || []) as AttendanceBoundary[]));
  }
  // Some deployed admin policies expose location_timeline but not the matching
  // attendance rows. Treating that visibility mismatch as authoritative used
  // to discard every real event and produce a misleading zero-row export.
  // Validate against attendance whenever at least one boundary is visible;
  // otherwise retain the persistent timeline projection itself.
  return buildTimelineSegments(events, attendance.length === 0 ? undefined : attendance);
}

function segmentState(event: any): TimelineSegment['event_type'] {
  if (event.event_type === 'check_out' || event.event_type === 'auto_checkout') return event.event_type;
  if (event.event_type === 'site_departure' || event.event_type === 'movement') return 'travelling';
  return event.site_id ? 'at_site' : 'unknown_location';
}

/** Read-only display/export projection of real point events; it never writes timeline data. */
export function buildTimelineSegments(events: any[], attendance?: AttendanceBoundary[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let open: TimelineSegment | null = null;
  const ordered = [...events].sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time) ||
    Number(a.event_type === 'check_out' || a.event_type === 'auto_checkout') - Number(b.event_type === 'check_out' || b.event_type === 'auto_checkout'));
  const closed = new Set<number>();
  const boundaries = attendance ? new Map(attendance.map(row => [row.id, row])) : null;
  for (const event of ordered) {
    const eventAt = Date.parse(event.event_time);
    if (!Number.isFinite(eventAt) || (boundaries && event.attendance_id == null)) continue;
    if (boundaries) {
      const boundary = boundaries.get(event.attendance_id);
      if (!boundary || boundary.employee_id !== event.employee_id) continue;
      const checkInAt = Date.parse(boundary.check_in_time);
      const checkoutAt = boundary.check_out_time ? Date.parse(boundary.check_out_time) : null;
      if (!Number.isFinite(checkInAt) || eventAt < checkInAt || (checkoutAt != null && eventAt > checkoutAt)) continue;
      if (event.event_type === 'check_out' || event.event_type === 'auto_checkout') {
        const expected = boundary.checkout_type === 'auto_checkout' ? 'auto_checkout' : 'check_out';
        if (checkoutAt == null || eventAt !== checkoutAt || event.event_type !== expected) continue;
      }
    }
    if (event.attendance_id != null && closed.has(event.attendance_id)) continue;
    const state = segmentState(event);
    const terminal = state === 'check_out' || state === 'auto_checkout';

    // An attendance id is a hard session boundary.  This is a read-only
    // projection rule: it prevents report rows from joining two real sessions
    // (including across midnight) without changing historical observations.
    if (open && open.attendance_id !== event.attendance_id) {
      segments.push(open);
      open = null;
    }

    if (terminal) {
      if (event.attendance_id != null) closed.add(event.attendance_id);
      if (open) {
        open.end_time = event.event_time;
        if (Date.parse(open.end_time!) > Date.parse(open.event_time) || open.event_type === 'at_site' || open.event_type === 'unknown_location') segments.push(open);
        open = null;
      }
      segments.push({ ...event, id: `terminal:${event.id}`, event_type: state, end_time: null, location_name: '' });
      continue;
    }
    const next: TimelineSegment = {
      ...event,
      id: `segment:${event.id}`,
      event_type: state,
      end_time: null,
      // Status labels are not physical locations. Keep them out of the
      // location field while retaining Unknown Location as a valid state.
      location_name: state === 'travelling' ? '' : state === 'unknown_location' ? 'Unknown Location' : event.location_name || 'Unknown Location',
    };
    const samePlace = open && open.event_type === next.event_type && (state !== 'at_site' || open.site_id === next.site_id);
    const rapidSiteFlip = open && state === 'at_site' && open.event_type === 'at_site' && open.site_id !== next.site_id &&
      new Date(event.event_time).getTime() - new Date(open.event_time).getTime() < REPORT_SITE_STABILITY_MS;
    if ((samePlace || rapidSiteFlip) && open) { open.end_time = event.event_time; continue; }
    if (open) {
      open.end_time = event.event_time;
      // A zero-duration route is noise, not evidence of travel.
      if (Date.parse(open.end_time!) > Date.parse(open.event_time) || open.event_type !== 'travelling') segments.push(open);
    }
    open = next;
  }
  if (open) segments.push(open);
  return segments;
}
