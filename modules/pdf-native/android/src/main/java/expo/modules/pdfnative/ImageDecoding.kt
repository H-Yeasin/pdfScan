package expo.modules.pdfnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// §18 W7: a scan's master (or a region of it, for a tile) to a JPEG of exactly width × height.
// A 2400 px master is never decoded whole for a 1080 px page: `inSampleSize` halves it inside the
// decoder, and only the last step is a scale. Regions go through BitmapRegionDecoder, which reads
// just that part of the file. EXIF orientation is ignored: the app's masters carry none (a page's
// turn is a setting, and JavaScript applies it).
internal class ImageDecoding(private val context: () -> Context?, private val output: JpegOutput) {
  val decode: ExecutorService = Executors.newSingleThreadExecutor { r -> Thread(r, "pdf-native-decode") }

  fun run(uri: String, options: DecodeOptions): Map<String, Any> {
    checkImageSize(options.width, options.height)
    checkColorMatrix(options.colorMatrix)
    val out = output.outFile(options.out)
    val region = options.region
    val decoded = try {
      if (region == null) decodeWhole(uri, options.width, options.height) else decodeRegion(uri, region, options.width, options.height)
    } catch (e: OutOfMemoryError) {
      throw PdfReadException("Not enough memory to decode the image")
    }
    val exact = if (decoded.width == options.width && decoded.height == options.height) {
      decoded
    } else {
      val scaled = Bitmap.createScaledBitmap(decoded, options.width, options.height, true)
      if (scaled !== decoded) decoded.recycle()
      scaled
    }
    return output.write(exact, options.colorMatrix, options.quality, out)
  }

  private fun decodeWhole(uri: String, width: Int, height: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw PdfReadException("Not a readable image")
    val options = BitmapFactory.Options().apply { inSampleSize = sampleFor(bounds.outWidth, bounds.outHeight, width, height) }
    return openStream(uri).use { BitmapFactory.decodeStream(it, null, options) } ?: throw PdfReadException("Not a readable image")
  }

  private fun decodeRegion(uri: String, region: DecodeRegion, width: Int, height: Int): Bitmap {
    val decoder = openStream(uri).use { stream ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        BitmapRegionDecoder.newInstance(stream)
      } else {
        @Suppress("DEPRECATION")
        BitmapRegionDecoder.newInstance(stream, false)
      }
    } ?: throw PdfReadException("Not a readable image")
    try {
      val left = region.x.roundToInt().coerceIn(0, decoder.width - 1)
      val top = region.y.roundToInt().coerceIn(0, decoder.height - 1)
      val right = (region.x + region.width).roundToInt().coerceIn(left + 1, decoder.width)
      val bottom = (region.y + region.height).roundToInt().coerceIn(top + 1, decoder.height)
      val options = BitmapFactory.Options().apply { inSampleSize = sampleFor(right - left, bottom - top, width, height) }
      return decoder.decodeRegion(Rect(left, top, right, bottom), options) ?: throw PdfReadException("Not a readable image")
    } finally {
      decoder.recycle()
    }
  }

  // The largest power of two that still leaves at least the wanted pixels (decoders round other
  // values down to one anyway).
  private fun sampleFor(sourceW: Int, sourceH: Int, width: Int, height: Int): Int {
    var sample = 1
    while (sourceW / (sample * 2) >= width && sourceH / (sample * 2) >= height) sample *= 2
    return max(1, min(sample, 64))
  }

  private fun openStream(uri: String): InputStream {
    val parsed = Uri.parse(uri)
    return try {
      if (parsed.scheme == "content") {
        context()?.contentResolver?.openInputStream(parsed) ?: throw PdfReadException("Can't open $uri")
      } else {
        FileInputStream(File(parsed.path ?: uri))
      }
    } catch (e: PdfReadException) {
      throw e
    } catch (e: Exception) {
      throw PdfReadException("Can't open $uri", e)
    }
  }
}
