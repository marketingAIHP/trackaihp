/**
 * Parse timestamp ensuring UTC timezone is handled correctly
 * Supabase returns timestamps without 'Z' suffix, so we need to handle that
 * This function is exported for use in components that need to parse timestamps
 */
export function parseTimestamp(date: string | Date | null | undefined): Date {
  if (!date) {
    return new Date(NaN); // invalid date signals missing timestamp
  }
  if (date instanceof Date) return date;

  let timestampStr = date;
  // If no timezone indicator, assume UTC (Supabase default)
  if (
    typeof timestampStr === 'string' &&
    !timestampStr.endsWith('Z') &&
    !timestampStr.includes('+') &&
    !timestampStr.includes('-', 10)
  ) {
    timestampStr = timestampStr + 'Z';
  }
  return new Date(timestampStr);
}

/**
 * Format date to readable string (in Indian locale)
 * Properly handles UTC timestamps from Supabase
 */
export function formatDate(date: string | Date): string {
  const d = parseTimestamp(date);
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time to readable string (in Indian locale with 12-hour format)
 * Properly handles UTC timestamps from Supabase
 */
export function formatTime(date: string | Date): string {
  const d = parseTimestamp(date);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format datetime to readable string (in Indian locale)
 * Properly handles UTC timestamps from Supabase
 */
export function formatDateTime(date: string | Date): string {
  const d = parseTimestamp(date);
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format relative time (e.g., "2 hours ago")
 * Properly handles UTC timestamps from Supabase
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  const d = parseTimestamp(date);
  if (isNaN(d.getTime())) return 'Just now';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);



  // Handle future dates (negative diff)
  if (diffMs < 0) {
    return 'Just now';
  }

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return formatDate(d);
}

/**
 * Format duration in hours and minutes
 * Properly handles UTC timestamps from Supabase
 */
export function formatDuration(start: string | Date, end: string | Date): string {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Format employee name
 */
export function formatEmployeeName(
  firstName: string,
  lastName: string
): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Get initials from name
 */
export function getInitials(firstName: string, lastName: string): string {
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName.charAt(0).toUpperCase();
  return `${first}${last}`;
}

/**
 * Format distance in meters to readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

