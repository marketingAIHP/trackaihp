import {Coordinates, WorkSite} from '../types';
import {GPS_ACCURACY_BUFFER} from '../constants/config';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 First coordinate
 * @param coord2 Second coordinate
 * @returns Distance in meters
 */
export function calculateDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1.latitude * Math.PI) / 180;
  const φ2 = (coord2.latitude * Math.PI) / 180;
  const Δφ = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const Δλ = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) *
      Math.cos(φ2) *
      Math.sin(Δλ / 2) *
      Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Check if coordinates are within geofence
 * @param employeeLocation Employee's current location
 * @param site Work site with geofence
 * @returns Object with isWithinGeofence, distance, geofenceRadius, and site
 */
export function checkGeofence(
  employeeLocation: Coordinates,
  site: WorkSite
): {
  isWithinGeofence: boolean;
  distance: number;
  geofenceRadius: number;
  site: WorkSite;
} {
  const siteLocation: Coordinates = {
    latitude: Number(site.latitude),
    longitude: Number(site.longitude),
  };

  const distance = calculateDistance(employeeLocation, siteLocation);
  const geofenceRadius = Number(site.geofence_radius) || 0;
  // Use small buffer only for GPS accuracy tolerance
  const effectiveRadius = geofenceRadius + GPS_ACCURACY_BUFFER;
  const isWithinGeofence = distance <= effectiveRadius;

  return {
    isWithinGeofence,
    distance: Math.round(distance),
    geofenceRadius: geofenceRadius,
    site,
  };
}

/**
 * Find the nearest work site to employee location
 * @param employeeLocation Employee's current location
 * @param sites Array of work sites
 * @returns Nearest site with distance, or null if no sites
 */
export function findNearestSite(
  employeeLocation: Coordinates,
  sites: WorkSite[]
): {site: WorkSite; distance: number} | null {
  if (sites.length === 0) return null;

  let nearestSite: WorkSite | null = null;
  let minDistance = Infinity;

  for (const site of sites) {
    const siteLocation: Coordinates = {
      latitude: Number(site.latitude),
      longitude: Number(site.longitude),
    };
    const distance = calculateDistance(employeeLocation, siteLocation);

    if (distance < minDistance) {
      minDistance = distance;
      nearestSite = site;
    }
  }

  if (!nearestSite) return null;

  return {
    site: nearestSite,
    distance: Math.round(minDistance),
  };
}

