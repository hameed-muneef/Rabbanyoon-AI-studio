package com.alrabbaniyoon.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Stores and arms native Android Adhan prayer alarms independent of WebView/JS timers.
 * Only ordinary Adhan raw resources are accepted (Eid Takbeerat is explicitly excluded).
 */
public final class NativeAdhanStore {

    private static final String PREFS_NAME = "RABBANI_NATIVE_ADHAN_STORE_V1";
    private static final String KEY_ALARMS_JSON = "scheduled_alarms_json";
    public static final String DEFAULT_ADHAN_RAW = "adhan_almulla";
    public static final String PLAYBACK_CHANNEL_ID = "al-rabbani-adhan-playback-v1";

    private static final Set<String> ALLOWED_ADHAN_RAW_NAMES = new HashSet<>(Arrays.asList(
        "adhan_almulla",
        "adhan_ahmad",
        "adhan_madinah",
        "adhan_madinah2",
        "adhan_mohammed",
        "adhan_hamad"
    ));

    public static final class AlarmSpec {
        public final int id;
        public final long triggerAtMs;
        public final String title;
        public final String body;
        public final String rawSound;
        public final String soundTitle;
        public final String adhanType;
        public final String prayerKey;

        public AlarmSpec(
            int id,
            long triggerAtMs,
            String title,
            String body,
            String rawSound,
            String soundTitle,
            String adhanType,
            String prayerKey
        ) {
            this.id = id;
            this.triggerAtMs = triggerAtMs;
            this.title = title;
            this.body = body;
            this.rawSound = sanitizeAdhanRawName(rawSound);
            this.soundTitle = soundTitle != null ? soundTitle : "";
            this.adhanType = "short".equals(adhanType) ? "short" : "full";
            this.prayerKey = prayerKey != null ? prayerKey : String.valueOf(id);
        }

        public String channelId() {
            return channelIdForRaw(rawSound);
        }

        public JSONObject toJson() throws JSONException {
            JSONObject obj = new JSONObject();
            obj.put("id", id);
            obj.put("triggerAtMs", triggerAtMs);
            obj.put("title", title);
            obj.put("body", body);
            obj.put("rawSound", rawSound);
            obj.put("soundTitle", soundTitle);
            obj.put("adhanType", adhanType);
            obj.put("prayerKey", prayerKey);
            return obj;
        }

        public static AlarmSpec fromJson(JSONObject obj) {
            if (obj == null) return null;
            int id = obj.optInt("id", 0);
            long triggerAtMs = obj.optLong("triggerAtMs", 0L);
            String title = obj.optString("title", "");
            String body = obj.optString("body", "");
            String rawSound = obj.optString("rawSound", DEFAULT_ADHAN_RAW);
            String soundTitle = obj.optString("soundTitle", "");
            String adhanType = obj.optString("adhanType", "full");
            String prayerKey = obj.optString("prayerKey", String.valueOf(id));
            if (id <= 0 || triggerAtMs <= 0L || title.isEmpty()) {
                return null;
            }
            return new AlarmSpec(id, triggerAtMs, title, body, rawSound, soundTitle, adhanType, prayerKey);
        }
    }

    private NativeAdhanStore() {}

    public static String sanitizeAdhanRawName(String rawName) {
        if (rawName != null && ALLOWED_ADHAN_RAW_NAMES.contains(rawName)) {
            return rawName;
        }
        return DEFAULT_ADHAN_RAW;
    }

    public static String channelIdForRaw(String rawName) {
        return "al-rabbani-adhan-" + sanitizeAdhanRawName(rawName) + "-v1";
    }

    public static void ensurePlaybackServiceChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(PLAYBACK_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            PLAYBACK_CHANNEL_ID,
            "تشغيل الأذان",
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("عرض التحكم وإيقاف الأذان أثناء التشغيل");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    public static String ensureAdhanNotificationChannel(Context context, String rawName, String soundLabel) {
        String safeRaw = sanitizeAdhanRawName(rawName);
        String channelId = channelIdForRaw(safeRaw);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return channelId;

        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return channelId;
        if (nm.getNotificationChannel(channelId) != null) return channelId;

        String name = (soundLabel != null && !soundLabel.trim().isEmpty())
            ? ("الأذان — " + soundLabel.trim())
            : "تنبيهات الأذان";

        NotificationChannel ch = new NotificationChannel(
            channelId,
            name,
            NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("تنبيهات مواقيت الصلاة بالصوت المختار");
        ch.enableVibration(true);
        ch.enableLights(true);
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        int resId = context.getResources().getIdentifier(safeRaw, "raw", context.getPackageName());
        if (resId != 0) {
            Uri soundUri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + context.getPackageName() + "/raw/" + safeRaw);
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            ch.setSound(soundUri, attrs);
        }

        nm.createNotificationChannel(ch);
        return channelId;
    }

    public static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return am == null || am.canScheduleExactAlarms();
    }

    public static synchronized int scheduleAll(Context context, List<AlarmSpec> newAlarms) {
        cancelAll(context);
        if (newAlarms == null || newAlarms.isEmpty()) return 0;

        ensurePlaybackServiceChannel(context);

        long nowMs = System.currentTimeMillis();
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        boolean exactAllowed = canScheduleExact(context);
        JSONArray stored = new JSONArray();
        int count = 0;

        for (AlarmSpec spec : newAlarms) {
            if (spec == null || spec.triggerAtMs <= nowMs + 1000L) continue;
            ensureAdhanNotificationChannel(context, spec.rawSound, spec.soundTitle);
            armAlarm(context, am, spec, exactAllowed);
            try {
                stored.put(spec.toJson());
                count++;
            } catch (JSONException ignored) {}
        }

        prefs(context).edit().putString(KEY_ALARMS_JSON, stored.toString()).apply();
        return count;
    }

    public static synchronized int restoreFutureAlarms(Context context) {
        List<AlarmSpec> existing = loadStored(context);
        if (existing.isEmpty()) return 0;

        ensurePlaybackServiceChannel(context);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        long nowMs = System.currentTimeMillis();
        boolean exactAllowed = canScheduleExact(context);
        JSONArray kept = new JSONArray();
        int restored = 0;

        for (AlarmSpec spec : existing) {
            if (spec.triggerAtMs <= nowMs + 1000L) continue;
            ensureAdhanNotificationChannel(context, spec.rawSound, spec.soundTitle);
            armAlarm(context, am, spec, exactAllowed);
            try {
                kept.put(spec.toJson());
                restored++;
            } catch (JSONException ignored) {}
        }

        prefs(context).edit().putString(KEY_ALARMS_JSON, kept.toString()).apply();
        return restored;
    }

    public static synchronized int cancelAll(Context context) {
        List<AlarmSpec> existing = loadStored(context);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        int cancelled = 0;
        if (am != null) {
            for (AlarmSpec spec : existing) {
                PendingIntent pi = buildReceiverPendingIntent(context, spec, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                    cancelled++;
                }
            }
        }
        prefs(context).edit().remove(KEY_ALARMS_JSON).apply();
        return cancelled;
    }

    public static List<AlarmSpec> loadStored(Context context) {
        List<AlarmSpec> out = new ArrayList<>();
        String raw = prefs(context).getString(KEY_ALARMS_JSON, null);
        if (raw == null || raw.isEmpty()) return out;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                AlarmSpec spec = AlarmSpec.fromJson(arr.optJSONObject(i));
                if (spec != null) out.add(spec);
            }
        } catch (JSONException ignored) {}
        return out;
    }

    private static void armAlarm(Context context, AlarmManager am, AlarmSpec spec, boolean exactAllowed) {
        PendingIntent pi = buildReceiverPendingIntent(
            context,
            spec,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (pi == null) return;
        if (exactAllowed) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, spec.triggerAtMs, pi);
                return;
            } catch (SecurityException ignored) {
                // Fall back to inexact if permission was revoked right before call.
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, spec.triggerAtMs, pi);
    }

    private static PendingIntent buildReceiverPendingIntent(Context context, AlarmSpec spec, int flags) {
        Intent intent = new Intent(context, AdhanAlarmReceiver.class);
        intent.setAction("com.alrabbaniyoon.app.ADHAN_ALARM_" + spec.id);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_ALARM_ID, spec.id);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_TITLE, spec.title);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_BODY, spec.body);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_RAW_SOUND, spec.rawSound);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_SOUND_TITLE, spec.soundTitle);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_ADHAN_TYPE, spec.adhanType);
        intent.putExtra(AdhanAlarmReceiver.EXTRA_CHANNEL_ID, spec.channelId());
        intent.putExtra(AdhanAlarmReceiver.EXTRA_PRAYER_KEY, spec.prayerKey);
        return PendingIntent.getBroadcast(context, spec.id, intent, flags);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
