import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface OpenSettingsResult {
  opened: boolean;
  error?: string;
  fallback?: string;
}

export interface AndroidEnvironmentStatus {
  sdkInt: number;
  canScheduleExactAlarms: boolean;
  ignoringBatteryOptimizations?: boolean;
  notificationsEnabled: boolean;
  hasAdhanRawSound: boolean;
  hasAllAdhanRawSounds?: boolean;
  isAdhanPlaying?: boolean;
  scheduledAdhanCount?: number;
}

export interface NativeAdhanAlarmInput {
  id: number;
  triggerAtMs: number;
  title: string;
  body: string;
  rawSound: string;
  soundTitle: string;
  adhanType: 'full' | 'short';
  prayerKey: string;
}

interface SettingsOpenerPlugin {
  openAppSettings(): Promise<OpenSettingsResult>;
  openBatterySettings(): Promise<OpenSettingsResult>;
  openExactAlarmSettings(): Promise<OpenSettingsResult>;
  getEnvironmentStatus(): Promise<AndroidEnvironmentStatus>;
  ensureNativeAdhanChannel(opts: { rawSound: string; soundTitle: string }): Promise<{ channelId: string }>;
  scheduleNativeAdhanAlarms(opts: { alarms: NativeAdhanAlarmInput[] }): Promise<{ scheduled: number; exact: boolean }>;
  cancelNativeAdhanAlarms(): Promise<{ cancelled: number }>;
  stopNativeAdhan(): Promise<{ stopped: boolean }>;
  addListener(eventName: 'appResumed', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

const SettingsOpener = registerPlugin<SettingsOpenerPlugin>('SettingsOpener');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && Boolean(cap.isNativePlatform());
}

export async function openAppSettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openAppSettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function openBatterySettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openBatterySettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function openExactAlarmSettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openExactAlarmSettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function getAndroidEnvironmentStatus(): Promise<AndroidEnvironmentStatus | null> {
  if (!isNative()) return null;
  try {
    return await SettingsOpener.getEnvironmentStatus();
  } catch {
    return null;
  }
}

export async function ensureNativeAdhanChannel(rawSound: string, soundTitle: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const res = await SettingsOpener.ensureNativeAdhanChannel({ rawSound, soundTitle });
    return res.channelId;
  } catch {
    return null;
  }
}

export async function scheduleNativeAdhanAlarms(alarms: NativeAdhanAlarmInput[]): Promise<{ scheduled: number; exact: boolean } | null> {
  if (!isNative()) return null;
  try {
    return await SettingsOpener.scheduleNativeAdhanAlarms({ alarms });
  } catch {
    return null;
  }
}

export async function cancelNativeAdhanAlarms(): Promise<number> {
  if (!isNative()) return 0;
  try {
    const res = await SettingsOpener.cancelNativeAdhanAlarms();
    return res.cancelled ?? 0;
  } catch {
    return 0;
  }
}

export async function stopNativeAdhan(): Promise<void> {
  if (!isNative()) return;
  try {
    await SettingsOpener.stopNativeAdhan();
  } catch { /* ignore */ }
}

export function addAppResumeListener(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  let active = true;
  let handle: PluginListenerHandle | null = null;
  const invoke = () => {
    if (active) cb();
  };
  const onVis = () => {
    if (document.visibilityState === 'visible') invoke();
  };
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('resume', invoke);
  if (isNative()) {
    void SettingsOpener.addListener('appResumed', invoke)
      .then((h) => {
        if (!active) void h.remove();
        else handle = h;
      })
      .catch(() => { /* ignore */ });
  }
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('resume', invoke);
    if (handle) void handle.remove();
  };
}
