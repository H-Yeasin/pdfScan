import ExpoModulesCore
import PDFKit
import UIKit

struct RenderOptions: Record {
  @Field var maxDim: Int = 1600
  // 0..1, like expo-image-manipulator's `compress`.
  @Field var quality: Double = 0.9
}

final class EncryptedPdfException: Exception, @unchecked Sendable {
  override var code: String { "ENCRYPTED" }
  override var reason: String { "The PDF is password-protected" }
}

final class PdfReadException: GenericException<String>, @unchecked Sendable {
  override var code: String { "READ_FAILED" }
  override var reason: String { param }
}

// §7 R1: the few PDF jobs JavaScript can't do well, on PDFKit. Pages are 0-based; sizes are PDF
// points with the page's /Rotate applied (what a reader shows), and text boxes are in that same
// rotated space with a top-left origin, matching the Android module.
//
// §18 W7 (version 2) adds sessions for the Reader's page surface (PdfSessions.swift).
public class PdfNativeModule: Module {
  private let sessions = PdfSessionStore()

  public func definition() -> ModuleDefinition {
    Name("PdfNative")

    OnCreate {
      self.sessions.start()
    }

    OnDestroy {
      self.sessions.stop()
    }

    // JavaScript checks this before it uses the session functions (a build made before W7 has none).
    Function("nativeVersion") { () -> Int in
      return 2
    }

    AsyncFunction("openDocument") { (uri: URL, password: String?) -> [String: Any] in
      return try self.sessions.openDocument(uri, password)
    }.runOnQueue(sessions.queue)

    AsyncFunction("closeDocument") { (id: String) in
      self.sessions.closeDocument(id)
    }.runOnQueue(sessions.queue)

    AsyncFunction("renderPageImage") { (id: String, page: Int, options: PageImageOptions) -> [String: Any] in
      return try renderPageImage(try self.sessions.page(id, page), options)
    }.runOnQueue(sessions.queue)

    // Not a session call: it runs on the module's own queue, beside the PDF work.
    AsyncFunction("decodeImage") { (uri: URL, options: DecodeOptions) -> [String: Any] in
      return try decodeImage(uri, options)
    }

    AsyncFunction("getSessionPageText") { (id: String, page: Int) -> [String: Any] in
      return try pageText(try self.sessions.page(id, page))
    }.runOnQueue(sessions.queue)

    AsyncFunction("getPageLinks") { (id: String, page: Int) -> [[String: Any]] in
      let doc = try self.sessions.document(id)
      return pageLinks(try self.sessions.page(id, page), doc)
    }.runOnQueue(sessions.queue)

    AsyncFunction("getOutline") { (id: String) -> [[String: Any]] in
      let doc = try self.sessions.document(id)
      guard let root = doc.outlineRoot else {
        return []
      }
      var total = 0
      return outlineItems(root, doc, 0, &total)
    }.runOnQueue(sessions.queue)

    AsyncFunction("getPageCount") { (uri: URL) -> Int in
      return try openDocument(uri).pageCount
    }

    AsyncFunction("getPageSize") { (uri: URL, page: Int) -> [String: Double] in
      let size = displaySize(try openPage(uri, page))
      return ["width": Double(size.width), "height": Double(size.height)]
    }

    AsyncFunction("renderPage") { (uri: URL, page: Int, options: RenderOptions) -> [String: Any] in
      let pdfPage = try openPage(uri, page)
      let size = displaySize(pdfPage)
      let scale = CGFloat(options.maxDim) / max(size.width, size.height)
      let target = CGSize(width: max(1, (size.width * scale).rounded()), height: max(1, (size.height * scale).rounded()))
      // thumbnail(of:for:) applies /Rotate and draws on white.
      let image = pdfPage.thumbnail(of: target, for: .mediaBox)
      guard let data = image.jpegData(compressionQuality: CGFloat(min(1, max(0, options.quality)))) else {
        throw PdfReadException("Can't encode page \(page)")
      }
      guard let cache = self.appContext?.fileSystem?.cachesDirectory else {
        throw PdfReadException("No cache directory")
      }
      let dir = URL(fileURLWithPath: cache, isDirectory: true).appendingPathComponent("pdf-native", isDirectory: true)
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let out = dir.appendingPathComponent("\(UUID().uuidString).jpg")
      try data.write(to: out)
      return ["uri": out.absoluteString, "width": Int(target.width), "height": Int(target.height)]
    }

    AsyncFunction("getPageText") { (uri: URL, page: Int) -> [String: Any] in
      return try pageText(try openPage(uri, page))
    }
  }
}

fileprivate func openDocument(_ uri: URL) throws -> PDFDocument {
  guard let doc = PDFDocument(url: uri) else {
    throw PdfReadException("Not a readable PDF")
  }
  if doc.isLocked {
    throw EncryptedPdfException()
  }
  return doc
}

fileprivate func openPage(_ uri: URL, _ index: Int) throws -> PDFPage {
  let doc = try openDocument(uri)
  guard index >= 0, index < doc.pageCount, let page = doc.page(at: index) else {
    throw PdfReadException("Page \(index) is out of range")
  }
  return page
}

func displaySize(_ page: PDFPage) -> CGSize {
  let box = page.bounds(for: .mediaBox)
  return page.rotation % 180 == 0 ? box.size : CGSize(width: box.height, height: box.width)
}

// Unrotated page space (origin bottom-left of the media box) to the displayed page (origin
// top-left, rotated clockwise by /Rotate).
func toDisplay(_ r: CGRect, _ page: PDFPage) -> CGRect {
  let box = page.bounds(for: .mediaBox)
  let x0 = r.minX - box.minX, x1 = r.maxX - box.minX
  let y0 = r.minY - box.minY, y1 = r.maxY - box.minY
  let w = box.width, h = box.height
  switch ((page.rotation % 360) + 360) % 360 {
  case 90:
    return CGRect(x: y0, y: x0, width: y1 - y0, height: x1 - x0)
  case 180:
    return CGRect(x: w - x1, y: y0, width: x1 - x0, height: y1 - y0)
  case 270:
    return CGRect(x: h - y1, y: w - x1, width: y1 - y0, height: x1 - x0)
  default:
    return CGRect(x: x0, y: h - y1, width: x1 - x0, height: y1 - y0)
  }
}

func pageText(_ page: PDFPage) throws -> [String: Any] {
  let size = displaySize(page)
  let text = page.string ?? ""
  var words: [[String: Any]] = []
  // PDFKit indexes characters in UTF-16 units, like NSString.
  let ns = text as NSString
  var current = ""
  var box: CGRect? = nil

  func flush() {
    if !current.isEmpty, let b = box {
      let d = toDisplay(b, page)
      words.append([
        "text": current,
        "left": Double(d.minX),
        "top": Double(d.minY),
        "width": Double(d.width),
        "height": Double(d.height),
      ])
    }
    current = ""
    box = nil
  }

  var i = 0
  while i < ns.length {
    let range = ns.rangeOfComposedCharacterSequence(at: i)
    let ch = ns.substring(with: range)
    i = range.location + range.length
    if ch.unicodeScalars.allSatisfy({ CharacterSet.whitespacesAndNewlines.contains($0) }) {
      flush()
      continue
    }
    let r = page.characterBounds(at: range.location)
    if r.isEmpty {
      current += ch
      continue
    }
    // A word that wraps onto the next line (no space between) becomes two words.
    if let b = box, r.maxY <= b.minY {
      flush()
    }
    current += ch
    box = box.map { $0.union(r) } ?? r
  }
  flush()

  return ["width": Double(size.width), "height": Double(size.height), "text": text, "words": words]
}
