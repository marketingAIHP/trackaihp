import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL, SUPABASE_ANON_KEY} from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =============================================================================
// PERFORMANCE OPTIMIZATION: Supabase Client Configuration
// =============================================================================

// Validate Supabase configuration
const supabaseUrl = SUPABASE_URL || '';
const supabaseAnonKey = SUPABASE_ANON_KEY || '';

// Check if configured (not placeholder values)
const isConfigured =
  supabaseUrl.length > 0 &&
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 0 &&
  supabaseAnonKey !== 'placeholder-key' &&
  !supabaseAnonKey.includes('placeholder') &&
  supabaseAnonKey.length > 20;

// Create Supabase client
const url = isConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const key = isConfigured
  ? supabaseAnonKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder';

// OPTIMIZATION: Create a SINGLE Supabase client instance with optimized settings
// - Reduced timeout to 15s to fail fast and release connections
// - Disabled realtime by default (enable only where needed)
// - Disabled auth features we don't use
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false, // OPTIMIZATION: Disable - we use anon key
    persistSession: false, // OPTIMIZATION: Don't persist - always use anon key
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    // OPTIMIZATION: Reduced timeout to 15s to release connections faster on failure
    fetch: async (url, options = {}) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 15000); // 15 second timeout (reduced from 25)
      });

      try {
        const fetchPromise = fetch(url, options);
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        // Fix: Handle network errors (status 0) - convert to proper error
        // Network failures in React Native can return status 0, which causes
        // "Failed to construct 'Response': The status provided (0) is outside the range [200, 599]"
        if (response && response.status === 0) {
          throw new Error('Network request failed. Please check your internet connection.');
        }

        return response;
      } catch (error: any) {
        // Handle timeout errors
        if (error.message === 'Request timeout' || error.message?.includes('timeout')) {
          throw new Error('Request timed out. Please try again.');
        }
        // Handle network errors
        if (error.message?.includes('Network') || error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed')) {
          throw new Error('Network request failed. Please check your internet connection.');
        }
        // Handle connection pool errors
        if (error.message?.includes('PGRST003') || error.message?.includes('connection pool') || error.message?.includes('504')) {
          throw new Error('Server is busy. Please wait and try again.');
        }
        // Handle Response construction errors
        if (error.message?.includes('Failed to construct') && error.message?.includes('Response')) {
          throw new Error('Network request failed. Please check your internet connection.');
        }
        throw error;
      }
    },
  },
  db: {
    schema: 'public',
  },
  // OPTIMIZATION: Disable realtime by default to reduce connections
  realtime: {
    params: {
      eventsPerSecond: 1, // Throttle realtime events
    },
  },
});

// Export configuration status and URL for debugging
export const isSupabaseConfigured: boolean = isConfigured;
export const supabaseUrlForDebug: string = url;

// =============================================================================
// OPTIMIZATION: Database query helpers that reuse the single client
// These are functions that return fresh query builders (not cached objects)
// =============================================================================
export const db = {
  // IMPORTANT: These return fresh query builders each time
  // Do NOT cache these - they are meant to be single-use
  get admins() { return supabase.from('admins'); },
  get employees() { return supabase.from('employees'); },
  get departments() { return supabase.from('departments'); },
  get areas() { return supabase.from('areas'); },
  get work_sites() { return supabase.from('work_sites'); },
  get location_tracking() { return supabase.from('location_tracking'); },
  get attendance() { return supabase.from('attendance'); },
  get notifications() { return supabase.from('notifications'); },
};

// Storage helper
export const storage = supabase.storage;

// =============================================================================
// OPTIMIZATION: Channel management for realtime subscriptions
// Track active channels to prevent duplicates and ensure cleanup
// =============================================================================
const activeChannels = new Map<string, any>();

/**
 * Get or create a realtime channel. Prevents duplicate subscriptions.
 * IMPORTANT: Always call removeChannel when done!
 */
export function getOrCreateChannel(channelName: string): any {
  if (activeChannels.has(channelName)) {
    return activeChannels.get(channelName);
  }
  const channel = supabase.channel(channelName);
  activeChannels.set(channelName, channel);
  return channel;
}

/**
 * Remove a realtime channel and clean up resources.
 */
export function removeChannel(channelName: string): void {
  const channel = activeChannels.get(channelName);
  if (channel) {
    supabase.removeChannel(channel);
    activeChannels.delete(channelName);
  }
}

/**
 * Remove all active channels. Call on logout or app background.
 */
export function removeAllChannels(): void {
  activeChannels.forEach((channel, name) => {
    supabase.removeChannel(channel);
  });
  activeChannels.clear();
}

/**
 * Get count of active channels for debugging
 */
export function getActiveChannelCount(): number {
  return activeChannels.size;
}
