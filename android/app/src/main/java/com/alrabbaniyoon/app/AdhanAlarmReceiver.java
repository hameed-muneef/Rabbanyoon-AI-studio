package com.alrabbaniyoon.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Logger;

/**
 * Receives native AlarmManager callbacks for prayer Adhan times.
 * Starts AdhanPlaybackService (MediaPlayback FGS) for full Adhan playback when permitted,
 * and falls back safely to posting the selected Adhan notification channel if FGS launch is blocked.
 */
public class AdhanAlarmReceiver extends BroadcastReceiver {

    public static final String EXTRA_ALARM_ID = "alarm_id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_RAW_SOUND = "raw_sound";
    public static final String EXTRA_SOUND_TITLE = "sound_title";
    public static final String EXTRA_ADHAN_TYPE = "adhan_type";
    public static final String EXTRA_CHANNEL_ID = "channel_id";
    public static final String EXTRA_PRAYER_KEY = "prayer_key";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return;
        }

        int alarmId = intent.getIntExtra(EXTRA_ALARM_ID, 1001);
        String title = intent.getStringExtra(EXTRA_TITLE);
        if (title == null || title.isEmpty()) title = "حان وقت الصلاة";
        String body = intent.getStringExtra(EXTRA_BODY);
        if (body == null) body = "";
        String rawSound = NativeAdhanStore.sanitizeAdhanRawName(intent.getStringExtra(EXTRA_RAW_SOUND));
        String soundTitle = intent.getStringExtra(EXTRA_SOUND_TITLE);
        String adhanType = intent.getStringExtra(EXTRA_ADHAN_TYPE);
        String prayerKey = intent.getStringExtra(EXTRA_PRAYER_KEY);

        String channelId = NativeAdhanStore.ensureAdhanNotificationChannel(context, rawSound, soundTitle);

        if ("short".equals(adhanType)) {
            postChannelNotification(context, alarmId, channelId, title, body);
            return;
        }

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock handoffLock = null;
        if (pm != null) {
            handoffLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alrabbaniyoon:adhan_handoff");
            handoffLock.setReferenceCounted(false);
            handoffLock.acquire(15_000L);
        }

        try {
            Intent svc = new Intent(context, AdhanPlaybackService.class);
            svc.setAction(AdhanPlaybackService.ACTION_PLAY);
            svc.putExtra(EXTRA_ALARM_ID, alarmId);
            svc.putExtra(EXTRA_TITLE, title);
            svc.putExtra(EXTRA_BODY, body);
            svc.putExtra(EXTRA_RAW_SOUND, rawSound);
            svc.putExtra(EXTRA_SOUND_TITLE, soundTitle);
            svc.putExtra(EXTRA_CHANNEL_ID, channelId);
            svc.putExtra(EXTRA_PRAYER_KEY, prayerKey);
            ContextCompat.startForegroundService(context, svc);
        } catch (Exception ex) {
            // Android 12+ throws ForegroundServiceStartNotAllowedException when exact alarms are denied
            // and the alarm fires inexact. Fall back cleanly to posting the channel notification with
            // the selected res/raw/adhan_*.mp3 sound.
            Logger.warn("AdhanAlarmReceiver", "FGS start blocked; falling back to channel notification: " + ex.getMessage());
            postChannelNotification(context, alarmId, channelId, title, body);
        } finally {
            if (handoffLock != null && handoffLock.isHeld()) {
                try { handoffLock.release(); } catch (Exception ignored) {}
            }
        }
    }

    public static void postChannelNotification(
        Context context,
        int notificationId,
        String channelId,
        String title,
        String body
    ) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_icon_config_sample)
            .setColor(Color.parseColor("#D4B678"))
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPi);

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {}
    }
}
