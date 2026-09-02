import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHeadlessSupabaseClient, supabase } from './supabase';
import { calculateDistance, checkGeofence } from '../utils/geofence';
import { CONTINUOUS_LOCATION_STORAGE_KEYS } from './continuousLocationConfig';
import type { Coordinates, WorkSite } from '../types';

export const TIMELINE_EVENT_TYPES = {
  check_in: 'check_in', location_update: 'location_update', site_arrival: 'site_arrival',
  site_departure: 'site_departure', unknown_location: 'unknown_location', movement: 'movement',
  check_out: 'check_out', auto_checkout: 'auto_checkout',
} as const;
export type TimelineEventType = keyof typeof TIMELINE_EVENT_TYPES;
export const TIMELINE_HEARTBEAT_MS = 5 * 60 * 1000;
export const TIMELINE_MOVEMENT_METERS = 75;
// GPS fixes close to overlapping work-site geofences can alternate between
// sites for a single observation.  This is used only by the read-only report
// projection; tracking and stored timeline points remain untouched.
const REPORT_SITE_STABILITY_MS = 5 * 60 * 1000;
const stateKey = (id: number) => `@timeline:last:${id}`;
const retryKey = (id: number) => `@timeline:retry:${id}`;
const MAX_RETRY_ATTEMPTS = 3;
type LogicalState = 'at_site' | 'travelling' | 'unknown';
type State = { attendanceId?: number | null; siteId?: number | null; latitude?: number; longitude?: number; at?: number; logicalState?: LogicalState; stateStartedAt?: number };
type TimelineInput = { employeeId: number; attendanceId?: number | null; eventType: TimelineEventType; coordinates?: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null };
type RetryItem = { input: TimelineInput; attempts: number };
export type TimelineSegment = {
  id: string; employee_id: number; attendance_id?: number | null; event_time: string; end_time?: string | null;
  event_type: 'at_site' | 'travelling' | 'unknown_location' | 'check_out' | 'auto_checkout';
  location_name: string; full_address?: string | null; site_id?: number | null; latitude?: number | null;
  longitude?: number | null; accuracy?: number | null; created_at: string;
};

function logTimelineFailure(stage: string, input: Partial<TimelineInput>, error: any) {
  console.warn('[LocationTimeline] write failed', {
    stage,
    employee_id: input.employeeId,
    attendance_id: input.attendanceId ?? null,
    event_type: input.eventType ?? null,
    gps_timestamp: input.eventTime ?? null,
    error: error?.message || String(error),
    code: error?.code || error?.status || null,
  });
}

function isTransientTimelineError(error: any) {
  const message = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  return status >= 500 || /network|timeout|timed out|failed to fetch|connection|temporar|pgrst00[23]/.test(message);
}

function siteAtCoordinates(site: WorkSite | null, coordinates: Coordinates) {
  return site && checkGeofence(coordinates, site).isWithinGeofence ? site : null;
}
async function saveObservationState(employeeId: number, state: State) {
  await AsyncStorage.setItem(stateKey(employeeId), JSON.stringify(state)).catch(() => {});
}

/**
 * The attendance record is the sole authority for a timeline session.  This
 * guard also runs for retry-queue writes, which otherwise do not pass through
 * recordTimelineLocation's active-attendance lookup.
 */
async function assertTimelineAttendanceBoundary(input: TimelineInput, eventTime: string, databaseClient: SupabaseClient) {
  if (input.attendanceId == null) throw new Error('Timeline event is missing its attendance session');
  const { data: attendance, error } = await databaseClient
    .from('attendance')
    .select('employee_id, check_in_time, check_out_time, checkout_type')
    .eq('id', input.attendanceId)
    .maybeSingle();
  if (error || !attendance || attendance.employee_id !== input.employeeId) {
    throw new Error('Timeline attendance session is unavailable');
  }
  const eventAt = Date.parse(eventTime);
  const checkInAt = Date.parse(attendance.check_in_time);
  const checkOutAt = attendance.check_out_time ? Date.parse(attendance.check_out_time) : null;
  if (!Number.isFinite(eventAt) || !Number.isFinite(checkInAt) || eventAt < checkInAt) {
    throw new Error('Timeline event is outside its attendance start boundary');
  }
  const terminal = input.eventType === 'check_out' || input.eventType === 'auto_checkout';
  if (terminal) {
    const expectedType = attendance.checkout_type === 'auto_checkout' ? 'auto_checkout' : 'check_out';
    if (checkOutAt == null || eventAt !== checkOutAt || input.eventType !== expectedType) {
      throw new Error('Timeline terminal event does not match the attendance checkout');
    }
  } else if (checkOutAt != null && eventAt >= checkOutAt) {
    throw new Error('Timeline event is after its attendance checkout boundary');
  }
}

async function insert(input: TimelineInput, databaseClient: SupabaseClient = supabase) {
  const eventTime = input.eventTime || new Date().toISOString();
  await assertTimelineAttendanceBoundary(input, eventTime, databaseClient);
  const terminal = input.eventType === 'check_out' || input.eventType === 'auto_checkout';
  // A checkout is a single attendance boundary, regardless of which observer
  // supplied the location snapshot. GPS coordinates must not make terminals
  // non-idempotent.
  const point = terminal ? 'terminal' : input.coordinates ? `${input.coordinates.latitude.toFixed(5)},${input.coordinates.longitude.toFixed(5)}` : 'no-location';
  const row = { employee_id: input.employeeId, attendance_id: input.attendanceId ?? null, event_time: eventTime, latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null, location_name: input.site?.name || 'Unknown location', full_address: input.site?.address ?? null, site_id: input.site?.id ?? null, event_type: input.eventType, accuracy: input.accuracy ?? null, idempotency_key: [input.employeeId, input.attendanceId ?? 'none', input.eventType, eventTime, point].join(':') };
  const result = await databaseClient.from('location_timeline').upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (result.error) throw result.error;
  if (input.coordinates) await saveObservationState(input.employeeId, { attendanceId: input.attendanceId, siteId: row.site_id, latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined, at: Date.now(), logicalState: row.site_id ? 'at_site' : input.eventType === 'site_departure' || input.eventType === 'movement' ? 'travelling' : 'unknown', stateStartedAt: Date.now() });
}

async function retryOneTimelineEvent(employeeId: number, databaseClient: SupabaseClient = supabase) {
  const raw = await AsyncStorage.getItem(retryKey(employeeId));
  const queue: RetryItem[] = raw ? JSON.parse(raw) : [];
  const item = queue[0];
  if (!item) return;
  try {
    await insert(item.input, databaseClient);
    queue.shift();
  } catch (error) {
    logTimelineFailure('retry_insert', item.input, error);
    item.attempts += 1;
    if (!isTransientTimelineError(error) || item.attempts >= MAX_RETRY_ATTEMPTS) queue.shift();
  }
  await AsyncStorage.setItem(retryKey(employeeId), JSON.stringify(queue)).catch(() => {});
}

async function queueRetry(input: TimelineInput) {
  const raw = await AsyncStorage.getItem(retryKey(input.employeeId));
  const queue: RetryItem[] = raw ? JSON.parse(raw) : [];
  const duplicate = queue.some(item => item.input.eventTime === input.eventTime && item.input.eventType === input.eventType && item.input.attendanceId === input.attendanceId);
  if (!duplicate) {
    queue.push({ input, attempts: 0 });
    await AsyncStorage.setItem(retryKey(input.employeeId), JSON.stringify(queue.slice(-MAX_RETRY_ATTEMPTS)));
  }
}

async function persistTimelineEvent(input: TimelineInput, databaseClient: SupabaseClient = supabase) {
  const event = { ...input, eventTime: input.eventTime || new Date().toISOString() };
  try {
    await retryOneTimelineEvent(event.employeeId, databaseClient);
  } catch (error) {
    logTimelineFailure('retry_queue', event, error);
  }
  try {
    await insert(event, databaseClient);
  } catch (error) {
    logTimelineFailure('insert', event, error);
    if (isTransientTimelineError(error)) {
      try {
        await queueRetry(event);
      } catch (queueError) {
        logTimelineFailure('retry_queue', event, queueError);
      }
    }
  }
}

export async function recordTimelineEvent(input: TimelineInput) { await persistTimelineEvent(input); }
export async function retryPendingTimelineEvents(employeeId: number) {
  try {
    await retryOneTimelineEvent(employeeId);
  } catch (error) {
    logTimelineFailure('resume_retry', { employeeId }, error);
  }
}
export async function recordTimelineLocation(input: { employeeId: number; attendanceId?: number | null; coordinates: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null; databaseClient?: SupabaseClient }) {
  try {
    const [raw, storedAttendanceId, storedSite] = await Promise.all([
      AsyncStorage.getItem(stateKey(input.employeeId)),
      AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.attendanceId),
      input.site === undefined ? AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.siteContext) : Promise.resolve(null),
    ]);
    const previous: State = raw ? JSON.parse(raw) : {};
    const attendanceId = input.attendanceId ?? (storedAttendanceId && Number.isFinite(Number(storedAttendanceId)) ? Number(storedAttendanceId) : undefined);
    if (attendanceId == null) {
      console.warn('[LocationTimeline] tracking context unavailable', { stage: 'attendance_context', employee_id: input.employeeId, gps_timestamp: input.eventTime ?? null });
      return;
    }
    // AsyncStorage can outlive an automatic checkout briefly. Verify the
    // session before writing a historical observation so a closed attendance
    // cannot receive a post-checkout timeline event. A buffered GPS fix from
    // before checkout is still accepted using its original timestamp.
    const eventTime = input.eventTime || new Date().toISOString();
    const { data: attendance, error: attendanceError } = await (input.databaseClient || supabase)
      .from('attendance')
      .select('check_in_time, check_out_time')
      .eq('id', attendanceId)
      .eq('employee_id', input.employeeId)
      .maybeSingle();
    const eventAt = Date.parse(eventTime);
    const checkInAt = Date.parse(attendance?.check_in_time || '');
    const checkOutAt = attendance?.check_out_time ? Date.parse(attendance.check_out_time) : null;
    if (attendanceError || !attendance || !Number.isFinite(eventAt) || (Number.isFinite(checkInAt) && eventAt < checkInAt) || (checkOutAt != null && Number.isFinite(checkOutAt) && eventAt > checkOutAt)) {
      console.warn('[LocationTimeline] ignored observation outside attendance boundary', { employee_id: input.employeeId, attendance_id: attendanceId, gps_timestamp: eventTime, reason: attendanceError ? 'attendance_lookup_failed' : 'closed_or_invalid_session' });
      return;
    }
    let persistedSite: WorkSite | null = null;
    if (input.site === undefined && storedSite) {
      try { persistedSite = JSON.parse(storedSite) as WorkSite; } catch { console.warn('[LocationTimeline] tracking context unavailable', { stage: 'site_context', employee_id: input.employeeId, gps_timestamp: input.eventTime ?? null }); }
    }
    const site = input.site === undefined ? siteAtCoordinates(persistedSite, input.coordinates) : siteAtCoordinates(input.site, input.coordinates);
    const siteId = site?.id ?? null;
    const observedAt = Date.parse(eventTime);
    const previousState: LogicalState = previous.logicalState || (previous.siteId ? 'at_site' : 'unknown');
    const distance = previous.latitude == null || previous.longitude == null ? Infinity : calculateDistance(input.coordinates, { latitude: previous.latitude, longitude: previous.longitude });
    let nextState: LogicalState = site ? 'at_site' : previousState;
    let type: TimelineEventType | null = null;
    if (!previous.at) { nextState = site ? 'at_site' : 'unknown'; type = 'location_update'; }
    else if (previousState === 'at_site' && !site) { nextState = 'travelling'; type = 'site_departure'; }
    else if (previousState !== 'at_site' && site) { nextState = 'at_site'; type = 'site_arrival'; }
    else if (previousState === 'travelling' && !site && observedAt - (previous.stateStartedAt || previous.at) >= TIMELINE_HEARTBEAT_MS && distance < TIMELINE_MOVEMENT_METERS) { nextState = 'unknown'; type = 'unknown_location'; }
    const next: State = { attendanceId, siteId, latitude: input.coordinates.latitude, longitude: input.coordinates.longitude, at: observedAt, logicalState: nextState, stateStartedAt: nextState === previousState ? previous.stateStartedAt || observedAt : observedAt };
    if (type) await persistTimelineEvent({ ...input, attendanceId, site, eventType: type }, input.databaseClient);
    else await retryOneTimelineEvent(input.employeeId, input.databaseClient);
    await saveObservationState(input.employeeId, next);
  } catch (error) { logTimelineFailure('processing', input, error); }
}
export async function getLocationTimeline(employeeId: number, from: string, to: string) {
  // On web the app's custom auth state can be ready before Supabase restores its
  // persisted session. Use the stored access token in that case so RLS evaluates
  // this report as the signed-in admin rather than as the anonymous role.
  const { data: { session } } = await supabase.auth.getSession();
  const client = session ? supabase : await createHeadlessSupabaseClient();
  const result = await client.from('location_timeline').select('*, site:work_sites(name,address)').eq('employee_id', employeeId).gte('event_time', from).lt('event_time', to).order('event_time', { ascending: true });
  if (result.error) throw result.error;
  if (result.data?.length) return buildTimelineSegments(result.data);

  // Timeline recording was introduced after attendance already existed in
  // production.  For those historical sessions, use the real attendance
  // boundaries as a minimal read-only report projection rather than claiming
  // that the employee had no events at all. New sessions are captured by the
  // database observers below and will use location_timeline directly.
  const attendanceResult = await client
    .from('attendance')
    .select('id, employee_id, site_id, check_in_time, check_out_time, check_in_latitude, check_in_longitude, check_in_location_name, check_out_latitude, check_out_longitude, check_out_location_name, checkout_type, site:work_sites(name,address)')
    .eq('employee_id', employeeId)
    .lt('check_in_time', to)
    .or(`check_out_time.is.null,check_out_time.gt.${from}`)
    .order('check_in_time', { ascending: true });
  if (attendanceResult.error) throw attendanceResult.error;
  const rangeStart = Date.parse(from), rangeEnd = Date.parse(to);
  const fallbackEvents = (attendanceResult.data || []).flatMap((attendance: any) => {
    const events: any[] = [];
    const checkInAt = Date.parse(attendance.check_in_time);
    if (checkInAt >= rangeStart && checkInAt < rangeEnd) {
      events.push({
        id: `attendance-check-in:${attendance.id}`, employee_id: attendance.employee_id, attendance_id: attendance.id,
        event_time: attendance.check_in_time, latitude: attendance.check_in_latitude, longitude: attendance.check_in_longitude,
        location_name: attendance.check_in_location_name || attendance.site?.name || 'Unknown location', full_address: attendance.site?.address || null,
        site_id: attendance.site_id, site: attendance.site, event_type: 'check_in', created_at: attendance.check_in_time,
      });
    }
    const checkOutAt = attendance.check_out_time ? Date.parse(attendance.check_out_time) : NaN;
    if (Number.isFinite(checkOutAt) && checkOutAt >= rangeStart && checkOutAt < rangeEnd) {
      events.push({
        id: `attendance-check-out:${attendance.id}`, employee_id: attendance.employee_id, attendance_id: attendance.id,
        event_time: attendance.check_out_time, latitude: attendance.check_out_latitude, longitude: attendance.check_out_longitude,
        location_name: '', full_address: null, site_id: null, site: null,
        event_type: attendance.checkout_type === 'auto_checkout' ? 'auto_checkout' : 'check_out', created_at: attendance.check_out_time,
      });
    }
    return events;
  });
  return buildTimelineSegments(fallbackEvents);
}

function segmentState(event: any): TimelineSegment['event_type'] {
  if (event.event_type === 'check_out' || event.event_type === 'auto_checkout') return event.event_type;
  if (event.event_type === 'site_departure' || event.event_type === 'movement') return 'travelling';
  return event.site_id ? 'at_site' : 'unknown_location';
}

/** Read-only display/export projection of real point events; it never writes timeline data. */
export function buildTimelineSegments(events: any[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let open: TimelineSegment | null = null;
  for (const event of events) {
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
      if (open) { open.end_time = event.event_time; segments.push(open); open = null; }
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
      location_name: state === 'travelling' ? '' : event.location_name || 'Unknown Location',
    };
    const samePlace = open && open.event_type === next.event_type && (state !== 'at_site' || open.site_id === next.site_id);
    const rapidSiteFlip = open && state === 'at_site' && open.event_type === 'at_site' && open.site_id !== next.site_id &&
      new Date(event.event_time).getTime() - new Date(open.event_time).getTime() < REPORT_SITE_STABILITY_MS;
    if ((samePlace || rapidSiteFlip) && open) { open.end_time = event.event_time; continue; }
    if (open) { open.end_time = event.event_time; segments.push(open); }
    open = next;
  }
  if (open) segments.push(open);
  return segments;
}
