package expo.modules.pdfnative

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import kotlin.math.roundToInt

// A few bitmaps kept by size, so a run of same-sized pages or tiles doesn't allocate (and collect)
// 4-8 MB each time. Emptied when the system asks for memory.
internal class BitmapPool {
  private val free = ArrayList<Bitmap>()

  @Synchronized
  fun take(width: Int, height: Int): Bitmap {
    val at = free.indexOfFirst { it.width == width && it.height == height }
    if (at >= 0) return free.removeAt(at)
    return try {
      Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    } catch (e: OutOfMemoryError) {
      for (b in free) b.recycle()
      free.clear()
      throw PdfReadException("Not enough memory for a $width x $height image")
    }
  }

  @Synchronized
  fun give(bitmap: Bitmap) {
    if (bitmap.isRecycled || !bitmap.isMutable) return
    free.add(bitmap)
    while (free.size > MAX_BITMAPS || free.sumOf { it.byteCount.toLong() } > MAX_BYTES) free.removeAt(0).recycle()
  }

  @Synchronized
  fun clear() {
    for (b in free) b.recycle()
    free.clear()
  }

  companion object {
    private const val MAX_BITMAPS = 4
    private const val MAX_BYTES = 48L * 1024 * 1024
  }
}

// What both image functions end with: an optional colour matrix, JPEG, and a file that is either
// whole or absent (`out.tmp`, then a rename). JavaScript chooses `out`, a deterministic path in the
// cache, so the same page at the same size is found again in a later session.
internal class JpegOutput(private val cacheDir: File, private val pool: BitmapPool) {
  fun outFile(out: String): File {
    val parsed = Uri.parse(out)
    val file = File((if (parsed.scheme == "file") parsed.path else null) ?: throw PdfReadException("`out` must be a file uri"))
    // Only ever a cache file: nothing this module writes is something the user can't lose.
    if (!file.canonicalPath.startsWith(cacheDir.canonicalPath + File.separator)) {
      throw PdfReadException("`out` must be inside the cache directory")
    }
    return file
  }

  // Takes the bitmap over: it goes back to the pool (or is recycled) here, also on failure.
  fun write(bitmap: Bitmap, colorMatrix: List<Double>?, quality: Double, out: File): Map<String, Any> {
    var source = bitmap
    try {
      if (colorMatrix != null) {
        val tinted = pool.take(source.width, source.height)
        val paint = Paint().apply { colorFilter = ColorMatrixColorFilter(ColorMatrix(FloatArray(20) { colorMatrix[it].toFloat() })) }
        Canvas(tinted).drawBitmap(source, 0f, 0f, paint)
        recycle(source)
        source = tinted
      }
      out.parentFile?.mkdirs()
      val tmp = File(out.path + ".tmp")
      try {
        FileOutputStream(tmp).use { stream ->
          source.compress(Bitmap.CompressFormat.JPEG, (quality.coerceIn(0.0, 1.0) * 100).roundToInt(), stream)
        }
        if (!tmp.renameTo(out)) throw PdfReadException("Can't write ${out.name}")
      } finally {
        if (tmp.exists()) tmp.delete()
      }
      return mapOf("uri" to Uri.fromFile(out).toString(), "width" to source.width, "height" to source.height)
    } finally {
      recycle(source)
    }
  }

  private fun recycle(bitmap: Bitmap) {
    if (bitmap.isMutable) pool.give(bitmap) else bitmap.recycle()
  }
}

internal fun checkImageSize(width: Int, height: Int) {
  if (width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw OutOfRangeException("An image of $width x $height px is outside 1..$MAX_IMAGE_SIDE")
  }
}

internal fun checkColorMatrix(colorMatrix: List<Double>?) {
  if (colorMatrix != null && colorMatrix.size != 20) throw OutOfRangeException("colorMatrix needs 20 numbers")
}

// Above the surface's largest bucket (2400 px) with room for the lab; a 4096 px square is 64 MB.
private const val MAX_IMAGE_SIDE = 4096

// §18 W7: a page, or a region of one, from an open session to a JPEG. The pdfium thread only
// draws; the colour matrix, the JPEG encode and the write run on `encode`, so drawing page N+1
// overlaps encoding page N. `inFlight` stops drawn bitmaps from piling up when encoding is the
// slower half.
internal class PageRenderer(private val pool: BitmapPool, private val output: JpegOutput) {
  val encode: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "pdf-native-encode") }
  private val inFlight = Semaphore(2)

  // On the pdfium thread. `done` is called on the encode thread, or here when drawing fails.
  fun render(session: PdfSession, page: Int, options: PageImageOptions, done: (Result<Map<String, Any>>) -> Unit) {
    val bitmap: Bitmap
    val out: File
    inFlight.acquire()
    try {
      checkSessionPage(session, page)
      checkImageSize(options.width, options.height)
      checkColorMatrix(options.colorMatrix)
      out = output.outFile(options.out)
      val matrix = pageMatrix(session.sizes[page], options)
      bitmap = pool.take(options.width, options.height)
      try {
        // The matrix can leave part of the bitmap outside the page; JPEG has no alpha.
        bitmap.eraseColor(Color.WHITE)
        session.doc.openPage(page).use { p ->
          p.renderPageBitmap(
            bitmap,
            matrix,
            RectF(0f, 0f, options.width.toFloat(), options.height.toFloat()),
            options.annotations,
            false,
            Color.WHITE,
            Color.WHITE,
          )
        }
      } catch (e: Throwable) {
        pool.give(bitmap)
        throw e
      }
    } catch (e: Throwable) {
      inFlight.release()
      done(Result.failure(e))
      return
    }
    encode.execute {
      val result = runCatching { output.write(bitmap, options.colorMatrix, options.quality, out) }
      inFlight.release()
      done(result)
    }
  }

  // Shown points (origin top-left, /Rotate applied) to bitmap pixels: [a, b, c, d, e, f] with
  // x' = a·x + c·y + e and y' = b·x + d·y + f. The pdfium library passes only the scale and the
  // translation on to FPDF_RenderPageBitmapWithMatrix, so b and c must be 0; a region of a page
  // needs nothing more, and the page's own turn is already in "shown".
  private fun pageMatrix(size: FloatArray, options: PageImageOptions): Matrix {
    val m = options.matrix
    val values = if (m == null) {
      floatArrayOf(options.width / size[0], 0f, 0f, 0f, options.height / size[1], 0f, 0f, 0f, 1f)
    } else {
      if (m.size != 6) throw OutOfRangeException("matrix needs 6 numbers")
      if (m[1] != 0.0 || m[2] != 0.0) throw OutOfRangeException("matrix can only scale and move")
      floatArrayOf(m[0].toFloat(), 0f, m[4].toFloat(), 0f, m[3].toFloat(), m[5].toFloat(), 0f, 0f, 1f)
    }
    return Matrix().apply { setValues(values) }
  }
}

internal fun checkSessionPage(session: PdfSession, page: Int) {
  if (page < 0 || page >= session.sizes.size) {
    throw OutOfRangeException("Page $page is out of range (0..${session.sizes.size - 1})")
  }
}
