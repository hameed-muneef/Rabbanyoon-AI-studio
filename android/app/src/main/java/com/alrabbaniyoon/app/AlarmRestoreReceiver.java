package com.alrabbaniyoon.app;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.UserManager;

import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.LocalNotificationSchedule;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Logger;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * Restores both native Adhan alarms (NativeAdhanStore) and pending LocalNotifications
 * after device reboot, package updates, timezone/clock changes, or exact-alarm permission changes.
 */
public class AlarmRestoreReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        String action = intent.getAction();
        if (!isSupportedAction(action)) {
            return;
        }

        UserManager um = context.getSystemService(UserManager.class);
        if (um == null || !um.isUserUnlocked()) {
            return;
        }

        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return;
        }

        try {
            NativeAdhanStore.restoreFutureAlarms(context);
        } catch (Exception ex) {
            Logger.error("AlarmRestoreReceiver", "Failed restoring native Adhan alarms on " + action, ex);
        }

        restoreCapacitorReminders(context, action);
    }

    private static void restoreCapacitorReminders(Context context, String action) {
        NotificationStorage storage = new NotificationStorage(context);
        List<String> ids = storage.getSavedNotificationIds();
        if (ids.isEmpty()) {
            return;
        }

        long nowMs = System.currentTimeMillis();
        boolean upgradeToExact = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
            AlarmManager am = context.getSystemService(AlarmManager.class);
            upgradeToExact = am != null && am.canScheduleExactAlarms();
        }
        List<LocalNotification> futureNotifications = new ArrayList<>();

        for (String id : ids) {
            LocalNotification notification = storage.getSavedNotification(id);
            if (notification == null || notification.getCancelled()) {
                continue;
            }
            LocalNotificationSchedule schedule = notification.getSchedule();
            if (schedule == null) {
                continue;
            }
            if (!schedule.isPerpetual()) {
                Date at = schedule.getAt();
                // Skip past one-shot notifications so clock changes/updates do not replay old alerts.
                if (at == null || at.getTime() <= nowMs) {
                    continue;
                }
            }
            if (upgradeToExact) {
                notification.setExactNotification(true);
            }
            futureNotifications.add(notification);
        }

        if (futureNotifications.isEmpty()) {
            return;
        }

        try {
            CapConfig config = CapConfig.loadDefault(context);
            LocalNotificationManager manager = new LocalNotificationManager(storage, null, context, config);
            manager.schedule(null, futureNotifications);
        } catch (Exception ex) {
            Logger.error("AlarmRestoreReceiver", "Failed restoring LocalNotifications on " + action, ex);
        }
    }

    private static boolean isSupportedAction(String action) {
        if (action == null) {
            return false;
        }
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)) {
            return true;
        }
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            && AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action);
    }
}
