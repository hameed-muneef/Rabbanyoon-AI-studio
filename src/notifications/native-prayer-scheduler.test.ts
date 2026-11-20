import { describe, it, expect } from 'vitest';
import {
  buildNativeAdhanAlarmInputs,
  buildNativeBeforeAfterPayloads,
  buildNativePrayerPayloads,
  buildNativeReminderPayloads,
  channelIdForRawSound,
  GENERAL_CHANNEL_ID,
} from './native-prayer-scheduler';
import { DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference, type Reminder } from './types';
import type { PrayerLocation } from '../prayer-location';

const MAKKAH: PrayerLocation = {
  name: 'Makkah',
  country: 'SA',
  latitude: 21.4225,
  longitude: 39.8262,
  method: 4,
  school: 0,
  timezone: 'Asia/Riyadh',
};

function makePrefs(patch: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    ...structuredClone(DEFAULT_NOTIFICATION_PREFERENCE),
    ...patch,
  };
}

describe('buildNativeAdhanAlarmInputs', () => {
  it('resolves per-prayer bundled Adhan voices and never substitutes Eid Takbeerat or a chime', () => {
    const now = new Date(2026, 10, 20, 0, 10, 0);
    const prefs = makePrefs();
    prefs.prayer_settings['الفجر'] = {
      ...prefs.prayer_settings['الفجر'],
      enabled: true,
      adhan_type: 'full',
      sound_id: 'adhan:madinah',
    };
    prefs.prayer_settings['الظهر'] = {
      ...prefs.prayer_settings['الظهر'],
      enabled: true,
      channel: 'both',
      adhan_type: 'short',
      sound_id: 'takbeer:eid', // Must NOT schedule takbeerat_eid for an ordinary prayer
    };

    const alarms = buildNativeAdhanAlarmInputs({
      location: MAKKAH,
      prefs,
      days: 7,
      now,
      defaultAdhanId: 'ahmad',
    });

    const fajr = alarms.filter((a) => a.prayerKey.endsWith(':Fajr'));
    const dhuhr = alarms.filter((a) => a.prayerKey.endsWith(':Dhuhr'));

    expect(fajr.length).toBeGreaterThan(0);
    expect(fajr[0].rawSound).toBe('adhan_madinah');
    expect(fajr[0].soundTitle).toBe('أذان الحرم المدني');
    expect(fajr[0].adhanType).toBe('full');

    expect(dhuhr.length).toBeGreaterThan(0);
    expect(dhuhr[0].rawSound).toBe('adhan_ahmad');
    expect(dhuhr[0].rawSound).not.toBe('takbeerat_eid');
    expect(dhuhr[0].adhanType).toBe('short');
  });
});

describe('buildNativePrayerPayloads', () => {
  it('filters strictly future events so past prayers never fire immediately', () => {
    const now = new Date(2026, 10, 20, 23, 50, 0);
    const payloads = buildNativePrayerPayloads({
      location: MAKKAH,
      prefs: makePrefs(),
      days: 7,
      now,
      generalChannelId: GENERAL_CHANNEL_ID,
      exactAlarm: true,
      defaultAdhanId: 'almulla',
    });

    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.schedule.at.getTime()).toBeGreaterThan(now.getTime() + 1000);
      expect(p.id).toBeGreaterThanOrEqual(1);
    }
    for (let i = 1; i < payloads.length; i++) {
      expect(payloads[i].schedule.at.getTime()).toBeGreaterThanOrEqual(payloads[i - 1].schedule.at.getTime());
    }
  });

  it('respects global_enabled, dnd_enabled, and categories.prayer', () => {
    const now = new Date(2026, 10, 20, 1, 0, 0);
    expect(buildNativePrayerPayloads({ location: MAKKAH, prefs: makePrefs({ global_enabled: false }), now })).toEqual([]);
    expect(buildNativePrayerPayloads({ location: MAKKAH, prefs: makePrefs({ dnd_enabled: true }), now })).toEqual([]);
    expect(
      buildNativePrayerPayloads({
        location: MAKKAH,
        prefs: makePrefs({ categories: { prayer: false, reminder: true, worship: true, goal: true, task: true } }),
        now,
      }),
    ).toEqual([]);
  });

  it('skips prayers marked silent or disabled and keeps before/after reminders properly routed', () => {
    const now = new Date(2026, 10, 20, 0, 10, 0);
    const prefs = makePrefs();
    prefs.prayer_settings['الفجر'] = {
      ...prefs.prayer_settings['الفجر'],
      enabled: true,
      adhan_type: 'silent',
    };
    prefs.prayer_settings['العصر'] = {
      ...prefs.prayer_settings['العصر'],
      enabled: true,
      adhan_type: 'full',
      channel: 'in_app',
    };
    prefs.prayer_settings['الظهر'] = {
      ...prefs.prayer_settings['الظهر'],
      enabled: true,
      adhan_type: 'full',
      channel: 'both',
      sound_id: 'adhan:hamad',
      remind_before_minutes: 15,
      remind_after_minutes: 10,
    };

    const payloads = buildNativePrayerPayloads({
      location: MAKKAH,
      prefs,
      days: 7,
      now,
      generalChannelId: GENERAL_CHANNEL_ID,
      exactAlarm: false,
      defaultAdhanId: 'almulla',
    });

    const fajr = payloads.filter((p) => p.extra?.prayer === 'Fajr');
    expect(fajr).toEqual([]);
    const asr = payloads.filter((p) => p.extra?.prayer === 'Asr');
    expect(asr).toEqual([]);

    const dhuhrMain = payloads.filter((p) => p.extra?.prayer === 'Dhuhr' && p.extra?.eventType === 'at');
    const dhuhrBefore = payloads.filter((p) => p.extra?.prayer === 'Dhuhr' && p.extra?.eventType === 'before');
    const dhuhrAfter = payloads.filter((p) => p.extra?.prayer === 'Dhuhr' && p.extra?.eventType === 'after');

    expect(dhuhrMain.length).toBeGreaterThan(0);
    expect(dhuhrBefore.length).toBe(dhuhrMain.length);
    expect(dhuhrAfter.length).toBe(dhuhrMain.length);
    expect(dhuhrMain[0].channelId).toBe(channelIdForRawSound('adhan_hamad'));
    expect(dhuhrBefore[0].channelId).toBe(GENERAL_CHANNEL_ID);
    expect(dhuhrMain[0].isExactNotification).toBe(false);

    const beforeAfterOnly = buildNativeBeforeAfterPayloads({ location: MAKKAH, prefs, days: 7, now });
    expect(beforeAfterOnly.every((p) => p.extra?.eventType !== 'at')).toBe(true);
  });

  it('excludes events falling inside quiet_hours including midnight wrap', () => {
    const now = new Date(2026, 10, 20, 0, 1, 0);
    const prefs = makePrefs({
      quiet_hours: { enabled: true, start: '00:00', end: '23:59' },
    });
    const payloads = buildNativePrayerPayloads({ location: MAKKAH, prefs, days: 7, now });
    expect(payloads).toEqual([]);
  });

  it('caps payloads safely under Android AlarmManager limit', () => {
    const now = new Date(2026, 10, 20, 0, 1, 0);
    const prefs = makePrefs();
    for (const key of Object.keys(prefs.prayer_settings) as Array<keyof typeof prefs.prayer_settings>) {
      prefs.prayer_settings[key] = {
        ...prefs.prayer_settings[key],
        enabled: true,
        remind_before_minutes: 10,
        remind_after_minutes: 10,
      };
    }
    const payloads = buildNativePrayerPayloads({ location: MAKKAH, prefs, days: 14, now });
    expect(payloads.length).toBeLessThanOrEqual(350);
  });
});

describe('buildNativeReminderPayloads', () => {
  const baseReminder: Reminder = {
    id: 'rem-1',
    user_id: '',
    title: 'أذكار الصباح',
    description: 'قراءة الأذكار',
    scheduled_at: '2026-11-20T07:00:00',
    recurrence: 'daily',
    category: 'worship',
    enabled: true,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };

  it('builds upcoming occurrences and snooze alarms for enabled reminders', () => {
    const now = new Date(2026, 10, 20, 6, 0, 0);
    const snoozed: Reminder = {
      ...baseReminder,
      snooze_until: new Date(now.getTime() + 10 * 60000).toISOString(),
    };
    const payloads = buildNativeReminderPayloads([snoozed], makePrefs(), now, GENERAL_CHANNEL_ID, true);
    expect(payloads.length).toBeGreaterThanOrEqual(2);
    expect(payloads[0].extra?.rabbaniKind).toBe('reminder');
    expect(payloads[0].channelId).toBe(GENERAL_CHANNEL_ID);
  });

  it('skips native scheduling when reminder default_channel is in_app only', () => {
    const now = new Date(2026, 10, 20, 6, 0, 0);
    const prefs = makePrefs({
      reminder_settings: {
        default_sound_id: 'chime',
        default_channel: 'in_app',
        snooze_minutes: 10,
      },
    });
    expect(buildNativeReminderPayloads([baseReminder], prefs, now)).toEqual([]);
  });
});
