// Build-time configuration for the local-only mobile variant.
// Set VITE_LOCAL_ONLY=true to disable accounts, cloud sync, payments and
// any feature that requires a network connection. Internet features are then
// shown separately and only when connectivity is available.
const hasSupabase = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const isNativeCapacitor =
  typeof window !== 'undefined' &&
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function' &&
  Boolean((window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform());

export const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === 'true' || isNativeCapacitor || !hasSupabase;