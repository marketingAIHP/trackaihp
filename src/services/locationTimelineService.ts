import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { calculateDistance } from '../utils/geofence';
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
type State = { attendanceId?: number | null; siteId?: number | null; latitude?: number; longitude?: number; at?: number };

async function siteFor(employeeId: number, c: Coordinates): Promise<WorkSite | null> {
  const employee = await supabase.from('employees').select('admin_id').eq('id', employeeId).maybeSingle();
  if (employee.error || !employee.data?.admin_id) return null;
  const sites = await supabase.from('work_sites').select('*').eq('admin_id', employee.data.admin_id).eq('is_active', true);
  if (sites.error) return null;
  return ((sites.data || []) as WorkSite[])
    .map(site => ({ site, distance: calculateDistance(c, site) }))
    .filter(x => x.distance <= x.site.geofence_radius)
    .sort((a, b) => a.distance - b.distance)[0]?.site || null;
}
async function insert(input: { employeeId: number; attendanceId?: number | null; eventType: TimelineEventType; coordinates?: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null }) {
  const eventTime = input.eventTime || new Date().toISOString();
  const point = input.coordinates ? `${input.coordinates.latitude.toFixed(5)},${input.coordinates.longitude.toFixed(5)}` : 'no-location';
  const row = { employee_id: input.employeeId, attendance_id: input.attendanceId ?? null, event_time: eventTime, latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null, location_name: input.site?.name || 'Unknown location', full_address: input.site?.address ?? null, site_id: input.site?.id ?? null, event_type: input.eventType, accuracy: input.accuracy ?? null, idempotency_key: [input.employeeId, input.attendanceId ?? 'none', input.eventType, eventTime, point].join(':') };
  const result = await supabase.from('location_timeline').upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (result.error) throw result.error;
  if (input.coordinates) await AsyncStorage.setItem(stateKey(input.employeeId), JSON.stringify({ attendanceId: input.attendanceId, siteId: row.site_id, latitude: row.latitude, longitude: row.longitude, at: Date.now() })).catch(() => {});
}
export async function recordTimelineEvent(input: Parameters<typeof insert>[0]) { try { await insert(input); } catch (error) { console.warn('[LocationTimeline] write failed', error); } }
export async function recordTimelineLocation(input: { employeeId: number; attendanceId?: number | null; coordinates: Coordinates; accuracy?: number | null; eventTime?: string; site?: WorkSite | null }) {
  try {
    const raw = await AsyncStorage.getItem(stateKey(input.employeeId)); const previous: State = raw ? JSON.parse(raw) : {};
    const site = input.site === undefined ? await siteFor(input.employeeId, input.coordinates) : input.site;
    const siteId = site?.id ?? null;
    const distance = previous.latitude == null || previous.longitude == null ? Infinity : calculateDistance(input.coordinates, { latitude: previous.latitude, longitude: previous.longitude });
    const type: TimelineEventType = !previous.at ? 'location_update' : previous.siteId !== undefined && previous.siteId !== siteId ? (siteId == null ? 'site_departure' : 'site_arrival') : distance >= TIMELINE_MOVEMENT_METERS ? 'movement' : Date.now() - previous.at >= TIMELINE_HEARTBEAT_MS ? 'location_update' : null as any;
    if (type) await insert({ ...input, site, eventType: type });
  } catch (error) { console.warn('[LocationTimeline] processing failed', error); }
}
export async function getLocationTimeline(employeeId: number, from: string, to: string) {
  const result = await supabase.from('location_timeline').select('*, site:work_sites(name,address)').eq('employee_id', employeeId).gte('event_time', from).lt('event_time', to).order('event_time', { ascending: true });
  if (result.error) throw result.error; return result.data || [];
}
