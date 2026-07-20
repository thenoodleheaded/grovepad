package com.grovepad.nativewidget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontStyle
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import org.json.JSONObject

private data class NoteContent(
    val title: String,
    val text: String,
    val color: String,
    val mode: String,
    val attribution: String,
)

class GrovepadNoteWidget : GlanceAppWidget() {
    companion object {
        const val STORAGE_NAME = "grovepad_note_widget"
        const val PAYLOAD_KEY = "note_widget_payload_v1"
    }

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val raw = context.getSharedPreferences(STORAGE_NAME, Context.MODE_PRIVATE)
            .getString(PAYLOAD_KEY, null)
        val note = parseNote(raw)
        provideContent { NoteSurface(note) }
    }

    private fun parseNote(raw: String?): NoteContent? {
        return try {
            val note = raw?.let(::JSONObject)?.optJSONObject("note") ?: return null
            NoteContent(
                title = note.optString("title", "Note").take(120),
                text = note.optString("text", "").take(4_096),
                color = note.optString("color", "yellow"),
                mode = note.optString("mode", "plain"),
                attribution = note.optString("attribution", "").take(120),
            )
        } catch (_: Exception) {
            null
        }
    }
}

class GrovepadNoteWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GrovepadNoteWidget()
}

@Composable
private fun NoteSurface(note: NoteContent?) {
    // Compose colors, never android.graphics ints: the Int overload of
    // ColorProvider() is @ColorRes and would crash resource lookup at render.
    val background = when (note?.color) {
        "pink" -> Color(0xFFFDD6E2)
        "blue" -> Color(0xFFCFEBFF)
        "green" -> Color(0xFFD3F3DA)
        "purple" -> Color(0xFFE7DAFF)
        else -> Color(0xFFFFF1A6)
    }
    val title = note?.title?.ifBlank { "Grovepad Note" } ?: "Grovepad Note"
    val body = note?.text?.ifBlank { "Choose a Note in Grovepad to keep it here." }
        ?: "Choose a Note in Grovepad to keep it here."

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ColorProvider(background))
            .cornerRadius(20.dp)
            .appWidgetBackground()
            .padding(16.dp),
    ) {
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(
                color = ColorProvider(Color(0xFF463A18)),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            ),
        )
        Spacer(modifier = GlanceModifier.height(8.dp))
        Text(
            text = if (note?.mode == "quote") "“$body”" else body,
            maxLines = 7,
            style = TextStyle(
                color = ColorProvider(Color(0xFF2F2A1B)),
                fontSize = 15.sp,
                fontStyle = if (note?.mode == "quote") FontStyle.Italic else FontStyle.Normal,
            ),
        )
        if (!note?.attribution.isNullOrBlank()) {
            Spacer(modifier = GlanceModifier.height(8.dp))
            Text(
                text = "— ${note?.attribution}",
                maxLines = 1,
                style = TextStyle(
                    color = ColorProvider(Color(0xFF5F522B)),
                    fontSize = 11.sp,
                ),
            )
        }
    }
}
