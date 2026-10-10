package expo.modules.pdfnative

import android.os.ParcelFileDescriptor
import android.os.SystemClock
import io.legere.pdfiumandroid.PdfDocument
import io.legere.pdfiumandroid.PdfPage
import io.legere.pdfiumandroid.PdfPasswordException
import io.legere.pdfiumandroid.PdfiumCore
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

// §18 W7: one open pdfium document, kept between calls (the v1 functions reopen the file every
// time). `sizes` are PDF points as the page is shown (its /Rotate applied), read once at open.
internal class PdfSession(
  val id: String,
  val doc: PdfDocument,
  val sizes: List<FloatArray>,
  val outline: List<Map<String, Any>>,
) {
  var lastUsed = SystemClock.elapsedRealtime()
}

// The open documents and the one thread every pdfium call runs on (pdfium isn't thread-safe; the
// library's own lock only covers single calls, not "open page, render, close page").
//
// Everything here except `trim` and `shutdown` must be called on `pdfium`. A session can go away
// under JavaScript's feet (the third open closes the least recently used one, 60 s without a call
// closes it, low memory closes all): the next call then fails with SESSION_CLOSED and
// services/pdf/pdfSession.ts opens it again. That keeps native memory bounded without JavaScript
// having to promise it will always close what it opened.
internal class PdfSessions(private val openFd: (String) -> ParcelFileDescriptor) {
  val pdfium: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "pdf-native-pdfium") }

  private val core = PdfiumCore()
  private val open = LinkedHashMap<String, PdfSession>()
  private var sweep: ScheduledFuture<*>? = null

  fun open(uri: String, password: String?): PdfSession {
    val fd = openFd(uri)
    val hasPassword = !password.isNullOrEmpty()
    // The document owns (and closes) the descriptor once open; until then it's ours to close.
    val doc = try {
      if (hasPassword) core.newDocument(fd, password) else core.newDocument(fd)
    } catch (e: PdfPasswordException) {
      fd.close()
      // pdfium reports "needs a password" and "that password is wrong" the same way.
      throw if (hasPassword) WrongPasswordException() else EncryptedPdfException()
    } catch (e: Exception) {
      fd.close()
      throw PdfReadException("Not a readable PDF", e)
    }
    val session = try {
      val count = doc.getPageCount()
      val sizes = ArrayList<FloatArray>(count)
      for (i in 0 until count) sizes.add(pageSize(doc, i))
      // A broken outline must not stop the document from opening.
      val outline = try {
        outlineOf(doc.getTableOfContents(), count, 0, intArrayOf(0))
      } catch (e: Exception) {
        emptyList()
      }
      PdfSession(UUID.randomUUID().toString(), doc, sizes, outline)
    } catch (e: Exception) {
      doc.close()
      throw PdfReadException("Not a readable PDF", e)
    }
    while (open.size >= MAX_OPEN) {
      val oldest = open.values.minByOrNull { it.lastUsed } ?: break
      close(oldest.id)
    }
    open[session.id] = session
    scheduleSweep()
    return session
  }

  fun require(id: String): PdfSession {
    val session = open[id] ?: throw SessionClosedException()
    session.lastUsed = SystemClock.elapsedRealtime()
    return session
  }

  fun close(id: String) {
    val session = open.remove(id) ?: return
    try {
      session.doc.close()
    } catch (e: Exception) {
      // Already closed: nothing left to free.
    }
  }

  // onTrimMemory, from the main thread.
  fun trim() {
    pdfium.execute { closeAll() }
  }

  fun shutdown() {
    pdfium.execute { closeAll() }
    pdfium.shutdown()
  }

  private fun closeAll() {
    for (id in open.keys.toList()) close(id)
  }

  private fun scheduleSweep() {
    if (sweep != null) return
    sweep = pdfium.schedule({
      sweep = null
      val now = SystemClock.elapsedRealtime()
      for (session in open.values.toList()) {
        if (now - session.lastUsed >= IDLE_MS) close(session.id)
      }
      if (open.isNotEmpty()) scheduleSweep()
    }, SWEEP_MS, TimeUnit.MILLISECONDS)
  }

  // FPDF_GetPageSizeByIndex reads the page's boxes and /Rotate without parsing its content, which
  // is what keeps a 300-page open fast. The library only offers it on a loaded page (and loading
  // parses the content), but that method uses nothing of the page except its document and index,
  // so it is asked through a page object that was never loaded. Such a page must not be closed.
  // SIZE_DPI makes the library's whole "pixels" hundredths of a point.
  private fun pageSize(doc: PdfDocument, index: Int): FloatArray {
    try {
      val size = PdfPage(doc, index, 0L, mutableMapOf()).getPageSize(SIZE_DPI)
      if (size.width > 0 && size.height > 0) {
        return floatArrayOf(size.width * 72f / SIZE_DPI, size.height * 72f / SIZE_DPI)
      }
    } catch (e: Exception) {
      // Fall through to the slow way.
    }
    return doc.openPage(index).use { p -> floatArrayOf(p.getPageWidthPoint().toFloat(), p.getPageHeightPoint().toFloat()) }
  }

  // `page` is left out when the entry has no destination in this document. Depth and size are
  // capped: outlines in the wild can loop.
  private fun outlineOf(items: List<PdfDocument.Bookmark>, pageCount: Int, depth: Int, total: IntArray): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    for (item in items) {
      if (total[0] >= OUTLINE_MAX_ITEMS) break
      total[0] += 1
      val entry = HashMap<String, Any>()
      entry["title"] = (item.title ?: "").trim()
      val page = item.pageIdx
      if (page >= 0 && page < pageCount) entry["page"] = page.toInt()
      entry["children"] =
        if (depth + 1 < OUTLINE_MAX_DEPTH) outlineOf(item.children, pageCount, depth + 1, total) else emptyList()
      out.add(entry)
    }
    return out
  }

  companion object {
    private const val MAX_OPEN = 2
    private const val IDLE_MS = 60_000L
    private const val SWEEP_MS = 15_000L
    private const val SIZE_DPI = 7200
    private const val OUTLINE_MAX_DEPTH = 12
    private const val OUTLINE_MAX_ITEMS = 5000
  }
}
