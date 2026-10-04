package com.example.kashyap_mobile

import android.app.Activity
import android.content.Intent
import android.util.Base64
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null
    private var saveBytes: ByteArray? = null
    private var profilePick = false
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kashyap/chat_attachments").setMethodCallHandler { call, result ->
            if (call.method == "save") {
                if (pending != null) { result.error("BUSY", "File dialog already open", null) }
                else {
                    try {
                        val encoded = call.argument<String>("dataBase64") ?: throw IllegalArgumentException()
                        if (encoded.length > 6990508) throw IllegalArgumentException()
                        val bytes = Base64.decode(encoded, Base64.DEFAULT)
                        if (bytes.size > 5 * 1024 * 1024) throw IllegalArgumentException()
                        saveBytes = bytes; pending = result
                        startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = call.argument<String>("mimeType") ?: "application/octet-stream"
                            putExtra(Intent.EXTRA_TITLE, call.argument<String>("fileName") ?: "attachment")
                        }, 4403)
                    } catch (error: Exception) { pending = null; saveBytes = null; result.error("SAVE", "Attachment save unavailable", null) }
                }
            }
            else if (call.method != "pick" && call.method != "pickProfile") { result.notImplemented() }
            else if (pending != null) { result.error("BUSY", "Attachment picker already open", null) }
            else {
                pending = result
                profilePick = call.method == "pickProfile"
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, if (profilePick) arrayOf("image/png", "image/jpeg", "image/webp") else arrayOf("image/png", "image/jpeg", "image/webp", "application/pdf"))
                }
                try { startActivityForResult(intent, 4402) }
                catch (error: Exception) { pending = null; result.error("PICKER", "Attachment picker unavailable", null) }
            }
        }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 4402 && requestCode != 4403) return
        val result = pending ?: return
        pending = null
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) { saveBytes = null; result.success(null); return }
        if (requestCode == 4403) {
            val bytes = saveBytes; saveBytes = null
            Thread {
                try {
                    if (bytes == null) throw IllegalArgumentException()
                    contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) } ?: throw IllegalArgumentException()
                    runOnUiThread { result.success(true) }
                } catch (error: Exception) { runOnUiThread { result.error("SAVE", "Attachment could not be saved", null) } }
            }.start()
            return
        }
        val profile = profilePick
        Thread {
            try {
                val mime = contentResolver.getType(uri)
                if (mime !in (if (profile) listOf("image/png", "image/jpeg", "image/webp") else listOf("image/png", "image/jpeg", "image/webp", "application/pdf"))) throw IllegalArgumentException("Unsupported file format")
                val bytes = contentResolver.openInputStream(uri)?.use { input ->
                    val output = ByteArrayOutputStream()
                    val chunk = ByteArray(8192)
                    while (true) {
                        val count = input.read(chunk)
                        if (count < 0) break
                        if (output.size() + count > (if (profile) 10 else 5) * 1024 * 1024) throw IllegalArgumentException("Image or attachment exceeds size limit")
                        output.write(chunk, 0, count)
                    }
                    output.toByteArray()
                } ?: throw IllegalArgumentException("Attachment unavailable")
                runOnUiThread { result.success(mapOf("mimeType" to mime, "dataBase64" to Base64.encodeToString(bytes, Base64.NO_WRAP))) }
            } catch (error: Exception) { runOnUiThread { result.error("FILE", if (profile) "Choose a JPEG, PNG or WebP up to 10 MB" else "Choose a PNG, JPEG, WebP or PDF up to 5 MB", null) } }
        }.start()
    }
}
