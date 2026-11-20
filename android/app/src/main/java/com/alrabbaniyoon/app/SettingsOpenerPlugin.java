package com.alrabbaniyoon.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "SettingsOpener")
public class SettingsOpenerPlugin extends Plugin {

    private static final String[] EXPECTED_ADHAN_RAW_NAMES = {
        "adhan_almulla",
        "adhan_ahmad",
        "adhan_madinah",
        "adhan_madinah2",
        "adhan_mohammed",
        "adhan_hamad"
    };

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyListeners("appResumed", new JSObject());
    }

    private boolean launchIntent(Intent intent) {
        Context context = getContext();
        if (context == null) {
            return false;
        }
        PackageManager pm = context.getPackageManager();
        if (pm == null || intent.resolveActivity(pm) == null) {
            return false;
        }
        try {
            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    private Intent buildAppDetailsIntent() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        return intent;
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            boolean opened = launchIntent(buildAppDetailsIntent());
            ret.put("opened", opened);
            if (!opened) {
                ret.put("error", "activity-not-found");
            }
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "unknown");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent batteryIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            boolean opened = launchIntent(batteryIntent);
            boolean fallback = false;
            if (!opened) {
                opened = launchIntent(buildAppDetailsIntent());
                fallback = opened;
            }
            ret.put("opened", opened);
            if (fallback) {
                ret.put("fallback", "app-details");
            } else if (!opened) {
                ret.put("error", "activity-not-found");
            }
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "unknown");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                ret.put("opened", false);
                ret.put("error", "not-required");
                call.resolve(ret);
                return;
            }
            Intent exactIntent = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + getContext().getPackageName())
            );
            boolean opened = launchIntent(exactIntent);
            boolean fallback = false;
            if (!opened) {
                opened = launchIntent(buildAppDetailsIntent());
                fallback = opened;
            }
            ret.put("opened", opened);
            if (fallback) {
                ret.put("fallback", "app-details");
            } else if (!opened) {
                ret.put("error", "activity-not-found");
            }
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "unknown");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getEnvironmentStatus(PluginCall call) {
        JSObject ret = new JSObject();
        Context context = getContext();
        String pkg = context.getPackageName();

        boolean canScheduleExact = NativeAdhanStore.canScheduleExact(context);

        Boolean ignoringBattery = null;
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            ignoringBattery = pm.isIgnoringBatteryOptimizations(pkg);
        }

        boolean notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        boolean allAdhanPresent = true;
        for (String name : EXPECTED_ADHAN_RAW_NAMES) {
            if (context.getResources().getIdentifier(name, "raw", pkg) == 0) {
                allAdhanPresent = false;
                break;
            }
        }
        boolean hasDefaultAdhan = context.getResources().getIdentifier(NativeAdhanStore.DEFAULT_ADHAN_RAW, "raw", pkg) != 0;

        ret.put("sdkInt", Build.VERSION.SDK_INT);
        ret.put("canScheduleExactAlarms", canScheduleExact);
        if (ignoringBattery != null) {
            ret.put("ignoringBatteryOptimizations", ignoringBattery);
        }
        ret.put("notificationsEnabled", notificationsEnabled);
        ret.put("hasAdhanRawSound", hasDefaultAdhan);
        ret.put("hasAllAdhanRawSounds", allAdhanPresent);
        ret.put("isAdhanPlaying", AdhanPlaybackService.isPlaying());
        ret.put("scheduledAdhanCount", NativeAdhanStore.loadStored(context).size());
        call.resolve(ret);
    }

    @PluginMethod
    public void ensureNativeAdhanChannel(PluginCall call) {
        Context context = getContext();
        String rawSound = NativeAdhanStore.sanitizeAdhanRawName(call.getString("rawSound"));
        String soundTitle = call.getString("soundTitle");
        String channelId = NativeAdhanStore.ensureAdhanNotificationChannel(context, rawSound, soundTitle);
        NativeAdhanStore.ensurePlaybackServiceChannel(context);
        JSObject ret = new JSObject();
        ret.put("channelId", channelId);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleNativeAdhanAlarms(PluginCall call) {
        Context context = getContext();
        JSArray arr = call.getArray("alarms");
        List<NativeAdhanStore.AlarmSpec> specs = new ArrayList<>();
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.optJSONObject(i);
                NativeAdhanStore.AlarmSpec spec = NativeAdhanStore.AlarmSpec.fromJson(obj);
                if (spec != null) {
                    specs.add(spec);
                }
            }
        }
        int scheduled = NativeAdhanStore.scheduleAll(context, specs);
        boolean exact = NativeAdhanStore.canScheduleExact(context);
        JSObject ret = new JSObject();
        ret.put("scheduled", scheduled);
        ret.put("exact", exact);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelNativeAdhanAlarms(PluginCall call) {
        int cancelled = NativeAdhanStore.cancelAll(getContext());
        JSObject ret = new JSObject();
        ret.put("cancelled", cancelled);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopNativeAdhan(PluginCall call) {
        Context context = getContext();
        try {
            Intent stopIntent = new Intent(context, AdhanPlaybackService.class);
            stopIntent.setAction(AdhanPlaybackService.ACTION_STOP);
            context.startService(stopIntent);
        } catch (Exception ignored) {}
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }
}
