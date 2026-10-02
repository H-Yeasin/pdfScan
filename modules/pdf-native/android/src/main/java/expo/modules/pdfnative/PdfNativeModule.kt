package expo.modules.pdfnative

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import io.legere.pdfiumandroid.PdfPasswordException
import io.legere.pdfiumandroid.PdfiumCore
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class RenderOptions : Record {
  @Field val maxDim: Int = 1600
  // 0..1, like expo-image-manipulator's `compress`.
  @Field val quality: Double = 0.9
}

class EncryptedPdfException : CodedException("ENCRYPTED", "The PDF is password-protected", null)

class PdfReadException(message: String, cause: Throwable? = null) : CodedException("READ_FAILED", message, cause)

// §7 R1: the few PDF jobs JavaScript can't do well. Pages are 0-based; sizes are PDF points with the
// page's /Rotate applied (what a reader shows). Rendering uses the platform's PdfRenderer; text
// uses pdfium (PdfRenderer has no text API), whose FPDF_PageToDevice puts each box in the same
// rotated, top-left-origin space as the rendered image.
class PdfNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfNative")

    AsyncFunction("getPageCount") { uri: String ->
      withRenderer(uri) { renderer -> renderer.pageCount }
    }

    AsyncFunction("getPageSize") { uri: String, page: Int ->
      withRenderer(uri) { renderer ->
        checkPage(page, renderer.pageCount)
        renderer.openPage(page).use { p -> mapOf("width" to p.width, "height" to p.height) }
      }
    }

    AsyncFunction("renderPage") { uri: String, page: Int, options: RenderOptions ->
      val cacheDir = File(appContext.cacheDirectory, "pdf-native").apply { mkdirs() }
      withRenderer(uri) { renderer ->
        checkPage(page, renderer.pageCount)
        renderer.openPage(page).use { p ->
          val scale = options.maxDim.toDouble() / max(p.width, p.height)
          val width = max(1, (p.width * scale).roundToInt())
          val height = max(1, (p.height * scale).roundToInt())
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          try {
            // PdfRenderer draws onto a transparent bitmap; JPEG has no alpha, so paper must be white.
            bitmap.eraseColor(Color.WHITE)
            p.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val out = File(cacheDir, "${UUID.randomUUID()}.jpg")
            FileOutputStream(out).use { stream ->
              val q = (options.quality.coerceIn(0.0, 1.0) * 100).roundToInt()
              bitmap.compress(Bitmap.CompressFormat.JPEG, q, stream)
            }
            mapOf("uri" to Uri.fromFile(out).toString(), "width" to width, "height" to height)
          } finally {
            bitmap.recycle()
          }
        }
      }
    }

    AsyncFunction("getPageText") { uri: String, page: Int ->
      pageText(uri, page)
    }
  }

  private fun openFd(uri: String): ParcelFileDescriptor {
    val parsed = Uri.parse(uri)
    return try {
      if (parsed.scheme == "content") {
        appContext.reactContext?.contentResolver?.openFileDescriptor(parsed, "r")
          ?: throw PdfReadException("Can't open $uri")
      } else {
        ParcelFileDescriptor.open(File(parsed.path ?: uri), ParcelFileDescriptor.MODE_READ_ONLY)
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw PdfReadException("Can't open $uri", e)
    }
  }

  private fun checkPage(page: Int, count: Int) {
    if (page < 0 || page >= count) throw PdfReadException("Page $page is out of range (0..${count - 1})")
  }

  // PdfRenderer allows one open page at a time and isn't thread-safe; calls are serialised.
  private fun <T> withRenderer(uri: String, block: (PdfRenderer) -> T): T = synchronized(lock) {
    val fd = openFd(uri)
    val renderer = try {
      PdfRenderer(fd)
    } catch (e: SecurityException) {
      fd.close()
      throw EncryptedPdfException()
    } catch (e: Exception) {
      fd.close()
      throw PdfReadException("Not a readable PDF", e)
    }
    // Closing the renderer closes the descriptor too.
    renderer.use(block)
  }

  private fun pageText(uri: String, page: Int): Map<String, Any> = synchronized(lock) {
    val fd = openFd(uri)
    // The document owns (and closes) the descriptor once open; until then it's ours to close.
    val doc = try {
      PdfiumCore().newDocument(fd)
    } catch (e: PdfPasswordException) {
      fd.close()
      throw EncryptedPdfException()
    } catch (e: Exception) {
      fd.close()
      throw PdfReadException("Not a readable PDF", e)
    }
    doc.use { d ->
      checkPage(page, d.getPageCount())
      d.openPage(page).use { p ->
        val width = p.getPageWidthPoint()
        val height = p.getPageHeightPoint()
        p.openTextPage().use { textPage ->
          val count = max(0, textPage.textPageCountChars())
          val text = StringBuilder(count)
          val words = ArrayList<Map<String, Any>>()
          var word = StringBuilder()
          var box: FloatArray? = null

          fun flush() {
            val b = box
            if (word.isNotEmpty() && b != null) {
              words.add(
                mapOf(
                  "text" to word.toString(),
                  "left" to b[0] / DEVICE_SCALE,
                  "top" to b[1] / DEVICE_SCALE,
                  "width" to (b[2] - b[0]) / DEVICE_SCALE,
                  "height" to (b[3] - b[1]) / DEVICE_SCALE,
                )
              )
            }
            word = StringBuilder()
            box = null
          }

          for (i in 0 until count) {
            val ch = textPage.textPageGetUnicode(i)
            text.append(ch)
            if (ch.isWhitespace() || ch == '\u0000') {
              flush()
              continue
            }
            val r = textPage.textPageGetCharBox(i)
            // Generated characters (pdfium's inferred spaces and line breaks) have empty boxes.
            if (r == null || (r.left == r.right && r.top == r.bottom)) {
              word.append(ch)
              continue
            }
            // Device space at DEVICE_SCALE × points: FPDF_PageToDevice returns whole pixels, so a
            // larger "device" keeps sub-point precision.
            val a = p.mapPageCoordsToDevice(0, 0, width * DEVICE_SCALE, height * DEVICE_SCALE, 0, r.left.toDouble(), r.top.toDouble())
            val c = p.mapPageCoordsToDevice(0, 0, width * DEVICE_SCALE, height * DEVICE_SCALE, 0, r.right.toDouble(), r.bottom.toDouble())
            val charBox = floatArrayOf(
              min(a.x, c.x).toFloat(),
              min(a.y, c.y).toFloat(),
              max(a.x, c.x).toFloat(),
              max(a.y, c.y).toFloat(),
            )
            val b = box
            // A word that wraps onto the next line (no space between) becomes two words.
            if (b != null && charBox[1] >= b[3]) flush()
            word.append(ch)
            box = box?.let {
              floatArrayOf(min(it[0], charBox[0]), min(it[1], charBox[1]), max(it[2], charBox[2]), max(it[3], charBox[3]))
            } ?: charBox
          }
          flush()
          mapOf(
            "width" to width,
            "height" to height,
            "text" to text.toString().replace("\u0000", "").replace("\r\n", "\n").replace('\r', '\n'),
            "words" to words,
          )
        }
      }
    }
  }

  companion object {
    private val lock = Any()
    private const val DEVICE_SCALE = 8
  }
}
