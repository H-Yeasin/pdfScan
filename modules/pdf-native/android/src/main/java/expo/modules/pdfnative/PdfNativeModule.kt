package expo.modules.pdfnative

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.RectF
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import io.legere.pdfiumandroid.PdfDocument
import io.legere.pdfiumandroid.PdfPasswordException
import io.legere.pdfiumandroid.PdfiumCore
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class RenderOptions : Record {
  @Field val maxDim: Int = 1600
  // 0..1, like expo-image-manipulator's `compress`.
  @Field val quality: Double = 0.9
}

// §18 W7, for renderPageImage. `matrix` maps shown points to pixels of the width × height image
// (see PageRenderer.pageMatrix); without it the whole page is fitted. `colorMatrix` is Android's
// 4×5 row-major form (the offsets are in 0..255). `out` is a file uri in the cache directory.
class PageImageOptions : Record {
  @Field val width: Int = 0
  @Field val height: Int = 0
  @Field val matrix: List<Double>? = null
  @Field val colorMatrix: List<Double>? = null
  @Field val annotations: Boolean = true
  @Field val quality: Double = 0.9
  @Field val out: String = ""
}

// In the source image's pixels.
class DecodeRegion : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 0.0
  @Field val height: Double = 0.0
}

class DecodeOptions : Record {
  @Field val width: Int = 0
  @Field val height: Int = 0
  @Field val region: DecodeRegion? = null
  @Field val colorMatrix: List<Double>? = null
  @Field val quality: Double = 0.9
  @Field val out: String = ""
}

class EncryptedPdfException : CodedException("ENCRYPTED", "The PDF is password-protected", null)

class WrongPasswordException : CodedException("PASSWORD_WRONG", "That password doesn't open the PDF", null)

class PdfReadException(message: String, cause: Throwable? = null) : CodedException("READ_FAILED", message, cause)

// The session was closed natively (idle, low memory, or a third document was opened): open again.
class SessionClosedException : CodedException("SESSION_CLOSED", "The PDF session is closed", null)

class OutOfRangeException(message: String) : CodedException("OUT_OF_RANGE", message, null)

// §7 R1: the few PDF jobs JavaScript can't do well. Pages are 0-based; sizes are PDF points with the
// page's /Rotate applied (what a reader shows). Rendering uses the platform's PdfRenderer; text
// uses pdfium (PdfRenderer has no text API), whose FPDF_PageToDevice puts each box in the same
// rotated, top-left-origin space as the rendered image.
//
// §18 W7 (version 2) adds sessions for the Reader's page surface: a document stays open in pdfium
// (PdfSessions), which also draws it (PageRenderer) - with a password on every API level, with
// annotations and form values, and a region at a time. The v1 functions are unchanged for the
// indexer and thumbnails; only getPageText moved onto the pdfium thread.
class PdfNativeModule : Module() {
  private val sessions = PdfSessions { uri -> openFd(uri) }
  private val pool = BitmapPool()
  private val output by lazy { JpegOutput(appContext.cacheDirectory, pool) }
  private val renderer by lazy { PageRenderer(pool, output) }
  private val decoding by lazy { ImageDecoding({ appContext.reactContext }, output) }

  private val memoryCallbacks = object : ComponentCallbacks2 {
    @Suppress("DEPRECATION") // RUNNING_CRITICAL is no longer sent from Android 14; older phones still do.
    override fun onTrimMemory(level: Int) {
      pool.clear()
      // The app is in the background, or in front and about to be killed: an open document is
      // tens of MB of pdfium caches. The Reader's next call opens it again.
      if (level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND || level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) {
        sessions.trim()
      }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}

    @Deprecated("Deprecated in Java")
    override fun onLowMemory() {
      pool.clear()
      sessions.trim()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PdfNative")

    OnCreate {
      appContext.reactContext?.applicationContext?.registerComponentCallbacks(memoryCallbacks)
    }

    OnDestroy {
      appContext.reactContext?.applicationContext?.unregisterComponentCallbacks(memoryCallbacks)
      sessions.shutdown()
      renderer.encode.shutdown()
      decoding.decode.shutdown()
      pool.clear()
    }

    // JavaScript checks this before it uses anything below (a build made before W7 has none).
    Function("nativeVersion") { NATIVE_VERSION }

    AsyncFunction("openDocument") { uri: String, password: String?, promise: Promise ->
      settleOn(sessions.pdfium, promise) {
        val session = sessions.open(uri, password)
        mapOf(
          "id" to session.id,
          "pageCount" to session.sizes.size,
          "pages" to session.sizes.map { mapOf("width" to it[0].toDouble(), "height" to it[1].toDouble()) },
          "hasOutline" to session.outline.isNotEmpty(),
        )
      }
    }

    AsyncFunction("closeDocument") { id: String, promise: Promise ->
      settleOn(sessions.pdfium, promise) {
        sessions.close(id)
        null
      }
    }

    AsyncFunction("renderPageImage") { id: String, page: Int, options: PageImageOptions, promise: Promise ->
      submit(sessions.pdfium, promise) {
        val session = try {
          sessions.require(id)
        } catch (e: Throwable) {
          reject(promise, e)
          return@submit
        }
        renderer.render(session, page, options) { result ->
          result.fold({ promise.resolve(it) }, { reject(promise, it) })
        }
      }
    }

    AsyncFunction("decodeImage") { uri: String, options: DecodeOptions, promise: Promise ->
      settleOn(decoding.decode, promise) { decoding.run(uri, options) }
    }

    AsyncFunction("getSessionPageText") { id: String, page: Int, promise: Promise ->
      settleOn(sessions.pdfium, promise) {
        val session = sessions.require(id)
        checkSessionPage(session, page)
        readPageText(session.doc, page, session.sizes[page])
      }
    }

    AsyncFunction("getPageLinks") { id: String, page: Int, promise: Promise ->
      settleOn(sessions.pdfium, promise) {
        val session = sessions.require(id)
        checkSessionPage(session, page)
        pageLinks(session, page)
      }
    }

    AsyncFunction("getOutline") { id: String, promise: Promise ->
      settleOn(sessions.pdfium, promise) { sessions.require(id).outline }
    }

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

    AsyncFunction("getPageText") { uri: String, page: Int, promise: Promise ->
      settleOn(sessions.pdfium, promise) { pageText(uri, page) }
    }
  }

  private fun submit(executor: Executor, promise: Promise, block: () -> Unit) {
    try {
      executor.execute(block)
    } catch (e: RejectedExecutionException) {
      // The module is being destroyed (a reload).
      promise.reject(SessionClosedException())
    }
  }

  private fun settleOn(executor: Executor, promise: Promise, block: () -> Any?) {
    submit(executor, promise) {
      try {
        promise.resolve(block())
      } catch (e: Throwable) {
        reject(promise, e)
      }
    }
  }

  private fun reject(promise: Promise, error: Throwable) {
    promise.reject(if (error is CodedException) error else PdfReadException(error.message ?: "PDF call failed", error))
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

  // On the pdfium thread.
  private fun pageText(uri: String, page: Int): Map<String, Any> {
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
    return doc.use { d ->
      checkPage(page, d.getPageCount())
      readPageText(d, page, null)
    }
  }

  // `size` is the session's (fractional) page size; without it the page's whole points are used,
  // as v1 always did.
  private fun readPageText(d: PdfDocument, page: Int, size: FloatArray?): Map<String, Any> {
    return d.openPage(page).use { p ->
        val width: Number = size?.get(0)?.toDouble() ?: p.getPageWidthPoint()
        val height: Number = size?.get(1)?.toDouble() ?: p.getPageHeightPoint()
        // Device space at about DEVICE_SCALE × points: FPDF_PageToDevice returns whole pixels, so a
        // larger "device" keeps sub-point precision.
        val deviceW = (width.toDouble() * DEVICE_SCALE).roundToInt()
        val deviceH = (height.toDouble() * DEVICE_SCALE).roundToInt()
        val scaleX = deviceW / width.toFloat()
        val scaleY = deviceH / height.toFloat()
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
                  "left" to b[0] / scaleX,
                  "top" to b[1] / scaleY,
                  "width" to (b[2] - b[0]) / scaleX,
                  "height" to (b[3] - b[1]) / scaleY,
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
            val a = p.mapPageCoordsToDevice(0, 0, deviceW, deviceH, 0, r.left.toDouble(), r.top.toDouble())
            val c = p.mapPageCoordsToDevice(0, 0, deviceW, deviceH, 0, r.right.toDouble(), r.bottom.toDouble())
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

  // Link annotations, in shown points with a top-left origin. A link has a `uri`, a `page`
  // (0-based, in this document), or both; one with neither is dropped. JavaScript decides which
  // schemes may be opened. URLs that are only written in the page's text are not annotations and
  // are not listed.
  private fun pageLinks(session: PdfSession, page: Int): List<Map<String, Any>> {
    val size = session.sizes[page]
    val deviceW = (size[0] * DEVICE_SCALE).roundToInt()
    val deviceH = (size[1] * DEVICE_SCALE).roundToInt()
    val scaleX = deviceW / size[0]
    val scaleY = deviceH / size[1]
    return session.doc.openPage(page).use { p ->
      val links = ArrayList<Map<String, Any>>()
      for (link in p.getPageLinks()) {
        val uri = link.uri?.takeIf { it.isNotBlank() }
        val dest = link.destPageIdx?.takeIf { it >= 0 && it < session.sizes.size }
        if (uri == null && dest == null) continue
        val b = link.bounds
        // The rect comes back with its corners in device order or not, depending on /Rotate.
        val r = p.mapRectToDevice(0, 0, deviceW, deviceH, 0, RectF(b.left, b.top, b.right, b.bottom))
        val entry = HashMap<String, Any>()
        entry["left"] = min(r.left, r.right) / scaleX
        entry["top"] = min(r.top, r.bottom) / scaleY
        entry["width"] = kotlin.math.abs(r.right - r.left) / scaleX
        entry["height"] = kotlin.math.abs(r.bottom - r.top) / scaleY
        if (uri != null) entry["uri"] = uri
        if (dest != null) entry["page"] = dest
        links.add(entry)
      }
      links
    }
  }

  companion object {
    private val lock = Any()
    private const val DEVICE_SCALE = 8
    private const val NATIVE_VERSION = 2
  }
}
