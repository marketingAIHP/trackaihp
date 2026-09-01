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
const stateKey = (id: number) => `@timeline:last:${id}`;
const retryKey = (id: number) => `@timeline:retry:${id}`;
const MAX_RETRY_ATTEMPTS = 3;
type State = { attendanceId?: number | null; siteId?: number | null; latitude?: number; longitude?: number; at?: number };
type TimelineInput = { employeeId: number; attendanceId?: number | null; eventType: TimelineEventType; coordinates?: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null };
type RetryItem = { input: TimelineInput; attempts: number };

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
async function insert(input: TimelineInput, databaseClient: SupabaseClient = supabase) {
  const eventTime = input.eventTime || new Date().toISOString();
  const point = input.coordinates ? `${input.coordinates.latitude.toFixed(5)},${input.coordinates.longitude.toFixed(5)}` : 'no-location';
  const row = { employee_id: input.employeeId, attendance_id: input.attendanceId ?? null, event_time: eventTime, latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null, location_name: input.site?.name || 'Unknown location', full_address: input.site?.address ?? null, site_id: input.site?.id ?? null, event_type: input.eventType, accuracy: input.accuracy ?? null, idempotency_key: [input.employeeId, input.attendanceId ?? 'none', input.eventType, eventTime, point].join(':') };
  const result = await databaseClient.from('location_timeline').upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (result.error) throw result.error;
  if (input.coordinates) await AsyncStorage.setItem(stateKey(input.employeeId), JSON.stringify({ attendanceId: input.attendanceId, siteId: row.site_id, latitude: row.latitude, longitude: row.longitude, at: Date.now() })).catch(() => {});
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
    }
    let persistedSite: WorkSite | null = null;
    if (input.site === undefined && storedSite) {
      try { persistedSite = JSON.parse(storedSite) as WorkSite; } catch { console.warn('[LocationTimeline] tracking context unavailable', { stage: 'site_context', employee_id: input.employeeId, gps_timestamp: input.eventTime ?? null }); }
    }
    const site = input.site === undefined ? siteAtCoordinates(persistedSite, input.coordinates) : siteAtCoordinates(input.site, input.coordinates);
    const siteId = site?.id ?? null;
    const distance = previous.latitude == null || previous.longitude == null ? Infinity : calculateDistance(input.coordinates, { latitude: previous.latitude, longitude: previous.longitude });
    const type: TimelineEventType = !previous.at ? 'location_update' : previous.siteId !== undefined && previous.siteId !== siteId ? (siteId == null ? 'site_departure' : 'site_arrival') : distance >= TIMELINE_MOVEMENT_METERS ? 'movement' : Date.now() - previous.at >= TIMELINE_HEARTBEAT_MS ? 'location_update' : null as any;
    if (type) await persistTimelineEvent({ ...input, attendanceId, site, eventType: type }, input.databaseClient);
    else await retryOneTimelineEvent(input.employeeId, input.databaseClient);
  } catch (error) { logTimelineFailure('processing', input, error); }
}
export async function getLocationTimeline(employeeId: number, from: string, to: string) {
  // On web the app's custom auth state can be ready before Supabase restores its
  // persisted session. Use the stored access token in that case so RLS evaluates
  // this report as the signed-in admin rather than as the anonymous role.
  const { data: { session } } = await supabase.auth.getSession();
  const client = session ? supabase : await createHeadlessSupabaseClient();
  const result = await client.from('location_timeline').select('*, site:work_sites(name,address)').eq('employee_id', employeeId).gte('event_time', from).lt('event_time', to).order('event_time', { ascending: true });
  if (result.error) throw result.error; return result.data || [];
}
