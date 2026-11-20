# Play Console — Permissions & Foreground Service Justification (Al-Rabbaniyyun)

## 1) Exact alarm permission (`SCHEDULE_EXACT_ALARM`) – core functionality
Al-Rabbaniyoon (الربانيون) is a local-only offline Islamic app whose core functionality includes alerting the user at the exact start time of each of the five daily Islamic prayers (adhan). Prayer times are computed locally on the device from the user's selected location and device time zone. A delay of even several minutes under Doze can cause the user to miss the prayer window.

The app declares `SCHEDULE_EXACT_ALARM` (not `USE_EXACT_ALARM`). Before scheduling, it calls `AlarmManager.canScheduleExactAlarms()` and, if denied, shows an in-app explanation and a button opening the system "Alarms & reminders" settings screen (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`). If the user declines, the app continues to function via `setAndAllowWhileIdle` inexact scheduling and informs the user that alerts may be slightly delayed. Alarms are only armed for prayers enabled by the user and can be disabled at any time.

## 2) MediaPlayback Foreground Service (`FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_MEDIA_PLAYBACK`)
When a prayer alarm fires in `AdhanAlarmReceiver` for a prayer configured with full Adhan (`adhanType = "full"`), `AdhanPlaybackService` starts as a bounded `mediaPlayback` foreground service (`android:foregroundServiceType="mediaPlayback"`):
- Plays the user-selected bundled Adhan MP3 recording locally via `MediaPlayer` with `AudioAttributes.USAGE_ALARM` and `AudioFocusRequest`.
- Displays a non-removable notification on channel `al-rabbani-adhan-playback-v1` with an explicit **"إيقاف الأذان" (Stop Adhan)** action and swipe/delete stop handling.
- Acquires a bounded partial wake lock and enforces a hard 6-minute auto-stop timeout, immediately stopping the foreground service on completion or stop action.
- On Android 12+ if `SCHEDULE_EXACT_ALARM` is not granted (so background FGS launch exemption does not apply and `ForegroundServiceStartNotAllowedException` occurs), `AdhanAlarmReceiver` catches the exception safely and posts a high-importance channel notification bound directly to the selected `res/raw/adhan_*.mp3`.

## 3) Notification permission (`POST_NOTIFICATIONS`)
Used for prayer alerts, pre/post-prayer reminders, and personal worship reminders. Not requested blindly on first launch — requested after user-facing explanation when enabling prayer alerts or reminders.

## 4) Boot & Time/Permission Recovery (`RECEIVE_BOOT_COMPLETED`)
`AlarmRestoreReceiver` listens to `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIMEZONE_CHANGED`, `TIME_SET`, and `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`, restoring strictly-future alarms saved in `NativeAdhanStore` alongside `@capacitor/local-notifications` restore handling.

## 5) Battery optimization
The app does **not** declare `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. It provides an optional diagnostics button opening system `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` so users on aggressive OEM devices (Xiaomi, Huawei, Oppo, Samsung) can exempt the app manually if desired.

## 6) Bundled Offline Adhan & Takbeerat Audio Assets
All audio files live offline in both `public/sounds/adhan/` and `android/app/src/main/res/raw/` (copied byte-for-byte from the project's `Azan/` source):
- `adhan_almulla.mp3` — الملا (default prayer Adhan)
- `adhan_ahmad.mp3` — أحمد العمادي
- `adhan_madinah.mp3` — أذان الحرم المدني
- `adhan_madinah2.mp3` — أذان الحرم المدني 2
- `adhan_mohammed.mp3` — أذان محمد رمضان (الحرم)
- `adhan_hamad.mp3` — حمد الدغريري
- `takbeerat_eid.mp3` — تكبيرات العيد (dedicated Eid Takbeerat track; excluded from prayer Adhan selection and `NativeAdhanStore` allowlist)

Per-voice Android 8+ notification channels (`al-rabbani-adhan-<rawName>-v1`) bind each voice's `android.resource://<package>/raw/<rawName>` sound cleanly without channel sound lock conflicts.

## 7) Play Console Review Video Checklist
Record a 30–60s video showing:
1. Prayer notification settings screen with prayer alerts enabled and an Adhan voice selected.
2. Exact-alarm explanation dialog opening Android's "Alarms & reminders" permission screen and granting it.
3. Scheduled Adhan alarm firing at prayer time with locked screen, playing the selected Adhan with notification "إيقاف الأذان" stop action.
4. Stopping/disabling prayer alerts in app settings.
