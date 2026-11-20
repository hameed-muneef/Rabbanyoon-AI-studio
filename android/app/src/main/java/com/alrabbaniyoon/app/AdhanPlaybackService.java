package com.alrabbaniyoon.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Logger;

/**
 * Bounded MediaPlayback Foreground Service for playing the complete local Adhan MP3.
 * Automatically acquires AudioFocus + PARTIAL_WAKE_LOCK, renders a Stop action notification,
 * deduplicates repeated triggers, handles interruptions cleanly, and always self-terminates.
 */
public class AdhanPlaybackService extends Service {

    public static final String ACTION_PLAY = "com.alrabbaniyoon.app.action.PLAY_ADHAN";
    public static final String ACTION_STOP = "com.alrabbaniyoon.app.action.STOP_ADHAN";

    private static final int PLAYBACK_NOTIF_ID = 90077;
    private static final long MAX_PLAYBACK_MS = 6 * 60 * 1000L; // Hard 6-minute safety cap
    private static final long DEDUP_WINDOW_MS = 90_000L;

    private static volatile boolean currentlyPlaying = false;
    private static String lastPrayerKey = null;
    private static long lastStartedElapsedMs = 0L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdogStop = this::stopPlaybackAndSelf;

    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasAudioFocus = false;
    private boolean noisyReceiverRegistered = false;

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent != null ? intent.getAction() : null)) {
                stopPlaybackAndSelf();
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS
            || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            stopPlaybackAndSelf();
        }
    };

    public static boolean isPlaying() {
        return currentlyPlaying;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            stopPlaybackAndSelf();
            return START_NOT_STICKY;
        }

        if (intent == null) {
            stopPlaybackAndSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(AdhanAlarmReceiver.EXTRA_TITLE);
        if (title == null || title.isEmpty()) title = "أذان الصلاة";
        String body = intent.getStringExtra(AdhanAlarmReceiver.EXTRA_BODY);
        if (body == null) body = "";
        String rawSound = NativeAdhanStore.sanitizeAdhanRawName(intent.getStringExtra(AdhanAlarmReceiver.EXTRA_RAW_SOUND));
        String channelId = intent.getStringExtra(AdhanAlarmReceiver.EXTRA_CHANNEL_ID);
        if (channelId == null || channelId.isEmpty()) {
            channelId = NativeAdhanStore.channelIdForRaw(rawSound);
        }
        String prayerKey = intent.getStringExtra(AdhanAlarmReceiver.EXTRA_PRAYER_KEY);

        // Must enter foreground immediately on API 26+/34+ before any early exit or setup.
        NativeAdhanStore.ensurePlaybackServiceChannel(this);
        Notification fgNotif = buildOngoingNotification(title, body);
        int fgsType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            : 0;
        ServiceCompat.startForeground(this, PLAYBACK_NOTIF_ID, fgNotif, fgsType);

        long nowElapsed = SystemClock.elapsedRealtime();
        if (prayerKey != null && prayerKey.equals(lastPrayerKey) && (nowElapsed - lastStartedElapsedMs) < DEDUP_WINDOW_MS) {
            if (!currentlyPlaying) {
                stopPlaybackAndSelf();
            }
            return START_NOT_STICKY;
        }
        lastPrayerKey = prayerKey;
        lastStartedElapsedMs = nowElapsed;

        startAdhanPlayback(rawSound, channelId, title, body);
        return START_NOT_STICKY;
    }

    private Notification buildOngoingNotification(String title, String body) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            this,
            PLAYBACK_NOTIF_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, AdhanPlaybackService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
            this,
            PLAYBACK_NOTIF_ID + 1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, NativeAdhanStore.PLAYBACK_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon_config_sample)
            .setColor(Color.parseColor("#D4B678"))
            .setContentTitle(title)
            .setContentText(body.isEmpty() ? "جارٍ تشغيل الأذان…" : body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPi)
            .setDeleteIntent(stopPi)
            .addAction(0, "إيقاف الأذان", stopPi)
            .build();
    }

    private void startAdhanPlayback(String rawSound, String fallbackChannelId, String title, String body) {
        releasePlayerAndLocks();

        int resId = getResources().getIdentifier(rawSound, "raw", getPackageName());
        if (resId == 0) {
            Logger.error("AdhanPlaybackService", "Missing raw resource: " + rawSound, null);
            stopPlaybackAndSelf();
            return;
        }

        acquireWakeLock();
        requestAudioFocus();
        registerNoisyReceiver();

        handler.removeCallbacks(watchdogStop);
        handler.postDelayed(watchdogStop, MAX_PLAYBACK_MS);

        Uri uri = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/raw/" + rawSound);
        MediaPlayer mp = new MediaPlayer();
        mediaPlayer = mp;
        currentlyPlaying = true;

        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            mp.setAudioAttributes(attrs);
            mp.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            mp.setDataSource(getApplicationContext(), uri);
            mp.setOnCompletionListener(player -> stopPlaybackAndSelf());
            mp.setOnErrorListener((player, what, extra) -> {
                Logger.error("AdhanPlaybackService", "MediaPlayer error what=" + what + " extra=" + extra, null);
                AdhanAlarmReceiver.postChannelNotification(this, PLAYBACK_NOTIF_ID + 2, fallbackChannelId, title, body);
                stopPlaybackAndSelf();
                return true;
            });
            mp.prepare();
            mp.start();
        } catch (Exception ex) {
            Logger.error("AdhanPlaybackService", "Failed starting Adhan MediaPlayer", ex);
            AdhanAlarmReceiver.postChannelNotification(this, PLAYBACK_NOTIF_ID + 2, fallbackChannelId, title, body);
            stopPlaybackAndSelf();
        }
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alrabbaniyoon:adhan_playback");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(MAX_PLAYBACK_MS);
    }

    private void requestAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(focusChangeListener, handler)
                .build();
            hasAudioFocus = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            @SuppressWarnings("deprecation")
            int res = audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            );
            hasAudioFocus = res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null || !hasAudioFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            @SuppressWarnings("deprecation")
            int ignored = audioManager.abandonAudioFocus(focusChangeListener);
        }
        hasAudioFocus = false;
        focusRequest = null;
    }

    private void registerNoisyReceiver() {
        if (noisyReceiverRegistered) return;
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        ContextCompat.registerReceiver(this, noisyReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        noisyReceiverRegistered = true;
    }

    private void unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) return;
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        noisyReceiverRegistered = false;
    }

    private void releasePlayerAndLocks() {
        handler.removeCallbacks(watchdogStop);
        currentlyPlaying = false;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            } catch (Exception ignored) {}
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        unregisterNoisyReceiver();
        abandonAudioFocus();
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        wakeLock = null;
    }

    private void stopPlaybackAndSelf() {
        releasePlayerAndLocks();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releasePlayerAndLocks();
        super.onDestroy();
    }
}
