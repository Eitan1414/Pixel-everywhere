import fs from "node:fs";
import path from "node:path";

const javaDirectory = path.resolve("android/app/src/main/java/com/pdd/pixeleverywhere");
const activityPath = path.join(javaDirectory, "MainActivity.java");
const pluginPath = path.join(javaDirectory, "PixelUpdaterPlugin.java");
const manifestPath = path.resolve("android/app/src/main/AndroidManifest.xml");

if (!fs.existsSync(activityPath) || !fs.existsSync(manifestPath)) {
  throw new Error("Le projet Android Capacitor doit être généré avant l’installation du module updater.");
}

fs.mkdirSync(javaDirectory, { recursive: true });

fs.writeFileSync(pluginPath, `package com.pdd.pixeleverywhere;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PixelUpdater")
public class PixelUpdaterPlugin extends Plugin {
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private long activeDownloadId = -1;
    private PluginCall activeCall;
    private BroadcastReceiver receiver;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String fileName = call.getString("fileName", "Pixel-Everywhere-update.apk")
            .replaceAll("[^A-Za-z0-9._-]", "-");

        Uri uri;
        try {
            uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
                throw new IllegalArgumentException("scheme");
            }
        } catch (Exception error) {
            call.reject("Le lien APK est invalide.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent permissionIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            permissionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(permissionIntent);
            call.reject(
                "Android demande d’autoriser Pixel Everywhere à installer cette mise à jour.",
                "INSTALL_PERMISSION_REQUIRED"
            );
            return;
        }

        if (activeDownloadId != -1) {
            call.reject("Une mise à jour est déjà en cours de téléchargement.");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(uri)
            .setTitle("Mise à jour Pixel Everywhere")
            .setDescription("Téléchargement de " + fileName)
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
            .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, fileName);

        String host = uri.getHost();
        if (host != null && host.contains("ngrok-free.")) {
            request.addRequestHeader("ngrok-skip-browser-warning", "pixel-everywhere");
        }

        registerDownloadReceiver(manager);
        activeCall = call;
        activeDownloadId = manager.enqueue(request);
        emitProgress(manager);
    }

    private void registerDownloadReceiver(DownloadManager manager) {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (completedId != activeDownloadId) return;
                finishDownload(manager);
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    private void emitProgress(DownloadManager manager) {
        progressHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (activeDownloadId == -1) return;
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(activeDownloadId))) {
                    if (cursor.moveToFirst()) {
                        long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                        long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                        int percent = total > 0 ? (int) Math.min(100, (downloaded * 100L) / total) : 0;
                        JSObject event = new JSObject();
                        event.put("stage", "downloading");
                        event.put("received", downloaded);
                        event.put("total", total);
                        event.put("percent", percent);
                        notifyListeners("downloadProgress", event);
                    }
                } catch (Exception ignored) {
                    // La notification système reste disponible même si une mesure échoue.
                }
                progressHandler.postDelayed(this, 500);
            }
        }, 250);
    }

    private void finishDownload(DownloadManager manager) {
        progressHandler.removeCallbacksAndMessages(null);
        PluginCall call = activeCall;
        long downloadId = activeDownloadId;
        activeCall = null;
        activeDownloadId = -1;

        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (!cursor.moveToFirst()) throw new IllegalStateException("Téléchargement introuvable.");
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                throw new IllegalStateException("Le téléchargement de l’APK a échoué.");
            }
        } catch (Exception error) {
            if (call != null) call.reject(error.getMessage());
            return;
        }

        Uri apkUri = manager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            if (call != null) call.reject("Android ne trouve pas l’APK téléchargé.");
            return;
        }

        JSObject progress = new JSObject();
        progress.put("stage", "installing");
        progress.put("percent", 100);
        notifyListeners("downloadProgress", progress);

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getContext().startActivity(installIntent);
            if (call != null) {
                JSObject result = new JSObject();
                result.put("opened", true);
                result.put("message", "Android a ouvert la confirmation d’installation.");
                call.resolve(result);
            }
        } catch (Exception error) {
            if (call != null) call.reject("Android ne peut pas ouvrir l’installateur APK.");
        }
    }

    @Override
    protected void handleOnDestroy() {
        progressHandler.removeCallbacksAndMessages(null);
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
                // Déjà désinscrit.
            }
            receiver = null;
        }
        super.handleOnDestroy();
    }
}
`);

let activity = fs.readFileSync(activityPath, "utf8");
if (!activity.includes("PixelUpdaterPlugin.class")) {
  activity = activity.replace(
    "import com.getcapacitor.BridgeActivity;",
    "import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;"
  );
  activity = activity.replace(
    /public class MainActivity extends BridgeActivity\s*\{[\s\S]*?\}/,
    `public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PixelUpdaterPlugin.class);
    super.onCreate(savedInstanceState);
  }
}`
  );
  fs.writeFileSync(activityPath, activity);
}

let manifest = fs.readFileSync(manifestPath, "utf8");
const permission = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace("<application", `${permission}\n\n    <application`);
  fs.writeFileSync(manifestPath, manifest);
}

console.log("Module PixelUpdater Android installé.");
