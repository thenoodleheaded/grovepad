package com.grovepad.nativewidget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SyncNoteWidgetArgs {
    lateinit var payload: String
}

@TauriPlugin
class NativeWidgetPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun syncNoteWidget(invoke: Invoke) {
        val payload = invoke.parseArgs(SyncNoteWidgetArgs::class.java).payload
        val preferences = activity.getSharedPreferences(GrovepadNoteWidget.STORAGE_NAME, Activity.MODE_PRIVATE)
        val changed = preferences.getString(GrovepadNoteWidget.PAYLOAD_KEY, null) != payload

        if (changed) {
            // commit() is deliberate: the receiver may run immediately and must
            // never race an asynchronous SharedPreferences write.
            if (!preferences.edit().putString(GrovepadNoteWidget.PAYLOAD_KEY, payload).commit()) {
                invoke.reject("Could not persist the Grovepad Note widget payload")
                return
            }
            val receiver = ComponentName(activity, GrovepadNoteWidgetReceiver::class.java)
            val ids = AppWidgetManager.getInstance(activity).getAppWidgetIds(receiver)
            if (ids.isNotEmpty()) {
                val update = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                    component = receiver
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                activity.sendBroadcast(update)
            }
        }

        invoke.resolve(JSObject().apply {
            put("supported", true)
            put("changed", changed)
        })
    }
}
