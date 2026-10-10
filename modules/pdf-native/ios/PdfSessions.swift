import CoreImage
import ExpoModulesCore
import ImageIO
import PDFKit
import UIKit

// §18 W7(b): the session API of the Android module, on PDFKit. Same contract: a document stays
// open between calls and is named by an id; this side may close it (a third open document, 60 s
// without a call, a memory warning) and the call then fails with SESSION_CLOSED, which
// services/pdf/pdfSession.ts answers by opening again. Sizes, word boxes and link rects are PDF
// points as the page is shown (media box, /Rotate applied), origin top-left.

struct PageImageOptions: Record {
  @Field var width: Int = 0
  @Field var height: Int = 0
  // Shown points → pixels: [a, b, c, d, e, f]. Android only scales and moves, so b and c must be 0
  // here too (one contract for both platforms).
  @Field var matrix: [Double]? = nil
  // Android's 4×5 row-major colour matrix (offsets in 0..255).
  @Field var colorMatrix: [Double]? = nil
  @Field var annotations: Bool = true
  @Field var quality: Double = 0.9
  @Field var out: String = ""
}

struct DecodeRegion: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct DecodeOptions: Record {
  @Field var width: Int = 0
  @Field var height: Int = 0
  @Field var region: DecodeRegion? = nil
  @Field var colorMatrix: [Double]? = nil
  @Field var quality: Double = 0.9
  @Field var out: String = ""
}

final class WrongPasswordException: Exception, @unchecked Sendable {
  override var code: String { "PASSWORD_WRONG" }
  override var reason: String { "That password doesn't open the PDF" }
}

final class SessionClosedException: Exception, @unchecked Sendable {
  override var code: String { "SESSION_CLOSED" }
  override var reason: String { "The PDF session is closed" }
}

final class OutOfRangeException: GenericException<String>, @unchecked Sendable {
  override var code: String { "OUT_OF_RANGE" }
  override var reason: String { param }
}

// Above the surface's largest bucket (2400 px), like Android.
private let maxImageSide = 4096

func checkImageSize(_ width: Int, _ height: Int) throws {
  if width < 1 || height < 1 || width > maxImageSide || height > maxImageSide {
    throw OutOfRangeException("An image of \(width) x \(height) px is outside 1..\(maxImageSide)")
  }
}

// Every session function runs on `queue` (the module sets it with runOnQueue), so the store needs
// no lock of its own.
final class PdfSessionStore {
  let queue = DispatchQueue(label: "pdf-native-sessions")

  private final class Session {
    let doc: PDFDocument
    var lastUsed = Date()
    init(_ doc: PDFDocument) { self.doc = doc }
  }

  private var open: [String: Session] = [:]
  private var sweepScheduled = false
  private var memoryObserver: NSObjectProtocol?

  private static let maxOpen = 2
  private static let idle: TimeInterval = 60
  private static let sweepEvery: TimeInterval = 15

  func start() {
    memoryObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.open.removeAll() }
    }
  }

  func stop() {
    if let observer = memoryObserver {
      NotificationCenter.default.removeObserver(observer)
      memoryObserver = nil
    }
    queue.async { self.open.removeAll() }
  }

  func openDocument(_ uri: URL, _ password: String?) throws -> [String: Any] {
    guard let doc = PDFDocument(url: uri) else {
      throw PdfReadException("Not a readable PDF")
    }
    if doc.isLocked {
      guard let password = password, !password.isEmpty else {
        throw EncryptedPdfException()
      }
      if !doc.unlock(withPassword: password) {
        throw WrongPasswordException()
      }
    }
    var pages: [[String: Double]] = []
    pages.reserveCapacity(doc.pageCount)
    for index in 0..<doc.pageCount {
      guard let page = doc.page(at: index) else {
        throw PdfReadException("Not a readable PDF")
      }
      let size = displaySize(page)
      pages.append(["width": Double(size.width), "height": Double(size.height)])
    }
    while open.count >= PdfSessionStore.maxOpen, let oldest = open.min(by: { $0.value.lastUsed < $1.value.lastUsed }) {
      open.removeValue(forKey: oldest.key)
    }
    let id = UUID().uuidString
    open[id] = Session(doc)
    scheduleSweep()
    return [
      "id": id,
      "pageCount": doc.pageCount,
      "pages": pages,
      "hasOutline": (doc.outlineRoot?.numberOfChildren ?? 0) > 0,
    ]
  }

  func closeDocument(_ id: String) {
    open.removeValue(forKey: id)
  }

  func document(_ id: String) throws -> PDFDocument {
    guard let session = open[id] else {
      throw SessionClosedException()
    }
    session.lastUsed = Date()
    return session.doc
  }

  func page(_ id: String, _ index: Int) throws -> PDFPage {
    let doc = try document(id)
    guard index >= 0, index < doc.pageCount, let page = doc.page(at: index) else {
      throw OutOfRangeException("Page \(index) is out of range (0..\(doc.pageCount - 1))")
    }
    return page
  }

  private func scheduleSweep() {
    if sweepScheduled { return }
    sweepScheduled = true
    queue.asyncAfter(deadline: .now() + PdfSessionStore.sweepEvery) { [weak self] in
      guard let self = self else { return }
      self.sweepScheduled = false
      let now = Date()
      for (id, session) in self.open where now.timeIntervalSince(session.lastUsed) >= PdfSessionStore.idle {
        self.open.removeValue(forKey: id)
      }
      if !self.open.isEmpty { self.scheduleSweep() }
    }
  }
}

// MARK: - Output

// JavaScript chooses `out`, a deterministic path in the caches directory, so the same page at the
// same size is found again in a later session. Only ever a cache file.
func outputURL(_ out: String) throws -> URL {
  guard let url = URL(string: out), url.isFileURL else {
    throw PdfReadException("`out` must be a file uri")
  }
  guard let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
    throw PdfReadException("No cache directory")
  }
  let root = caches.standardizedFileURL.resolvingSymlinksInPath().path
  let target = url.standardizedFileURL.resolvingSymlinksInPath().path
  if !target.hasPrefix(root.hasSuffix("/") ? root : root + "/") {
    throw PdfReadException("`out` must be inside the cache directory")
  }
  return url
}

// No colour management inside the filter, so the matrix means what it means on Android (it is
// applied to the encoded values).
private let colorContext = CIContext(options: [.workingColorSpace: NSNull()])

private func applyColorMatrix(_ image: CGImage, _ m: [Double]) throws -> CGImage {
  guard let filter = CIFilter(name: "CIColorMatrix") else {
    throw PdfReadException("No colour matrix filter")
  }
  let input = CIImage(cgImage: image)
  filter.setValue(input, forKey: kCIInputImageKey)
  filter.setValue(CIVector(x: CGFloat(m[0]), y: CGFloat(m[1]), z: CGFloat(m[2]), w: CGFloat(m[3])), forKey: "inputRVector")
  filter.setValue(CIVector(x: CGFloat(m[5]), y: CGFloat(m[6]), z: CGFloat(m[7]), w: CGFloat(m[8])), forKey: "inputGVector")
  filter.setValue(CIVector(x: CGFloat(m[10]), y: CGFloat(m[11]), z: CGFloat(m[12]), w: CGFloat(m[13])), forKey: "inputBVector")
  filter.setValue(CIVector(x: CGFloat(m[15]), y: CGFloat(m[16]), z: CGFloat(m[17]), w: CGFloat(m[18])), forKey: "inputAVector")
  // Android's offsets are in 0..255, Core Image's in 0..1.
  filter.setValue(
    CIVector(x: CGFloat(m[4] / 255), y: CGFloat(m[9] / 255), z: CGFloat(m[14] / 255), w: CGFloat(m[19] / 255)),
    forKey: "inputBiasVector")
  guard let output = filter.outputImage, let result = colorContext.createCGImage(output, from: input.extent) else {
    throw PdfReadException("Can't apply the colour matrix")
  }
  return result
}

// The file is whole or absent (`.atomic` writes beside it and renames).
func writeJpeg(_ image: UIImage, _ colorMatrix: [Double]?, _ quality: Double, _ out: URL) throws -> [String: Any] {
  var final = image
  if let m = colorMatrix {
    if m.count != 20 {
      throw OutOfRangeException("colorMatrix needs 20 numbers")
    }
    guard let cg = image.cgImage else {
      throw PdfReadException("Can't read the rendered image")
    }
    final = UIImage(cgImage: try applyColorMatrix(cg, m))
  }
  guard let data = final.jpegData(compressionQuality: CGFloat(min(1, max(0, quality)))) else {
    throw PdfReadException("Can't encode the image")
  }
  try FileManager.default.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
  try data.write(to: out, options: .atomic)
  let pixels = final.cgImage.map { (w: $0.width, h: $0.height) } ?? (w: Int(final.size.width), h: Int(final.size.height))
  return ["uri": out.absoluteString, "width": pixels.w, "height": pixels.h]
}

private func pixelRenderer(_ width: Int, _ height: Int) -> UIGraphicsImageRenderer {
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = true
  return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
}

// MARK: - Pages

func renderPageImage(_ page: PDFPage, _ options: PageImageOptions) throws -> [String: Any] {
  try checkImageSize(options.width, options.height)
  let out = try outputURL(options.out)
  let size = displaySize(page)
  var transform = CGAffineTransform(
    scaleX: CGFloat(options.width) / size.width, y: CGFloat(options.height) / size.height)
  if let m = options.matrix {
    if m.count != 6 {
      throw OutOfRangeException("matrix needs 6 numbers")
    }
    if m[1] != 0 || m[2] != 0 {
      throw OutOfRangeException("matrix can only scale and move")
    }
    transform = CGAffineTransform(a: CGFloat(m[0]), b: 0, c: 0, d: CGFloat(m[3]), tx: CGFloat(m[4]), ty: CGFloat(m[5]))
  }
  // PDFKit has no "without annotations" switch: hide them for this one draw.
  let hidden = options.annotations ? [] : page.annotations.filter { $0.shouldDisplay }
  hidden.forEach { $0.shouldDisplay = false }
  defer { hidden.forEach { $0.shouldDisplay = true } }

  let image = pixelRenderer(options.width, options.height).image { context in
    let cg = context.cgContext
    // The matrix can leave part of the image outside the page; JPEG has no alpha.
    UIColor.white.setFill()
    cg.fill(CGRect(x: 0, y: 0, width: options.width, height: options.height))
    cg.concatenate(transform)
    // draw(with:to:) draws the turned page with its origin bottom-left and y up.
    cg.translateBy(x: 0, y: size.height)
    cg.scaleBy(x: 1, y: -1)
    page.draw(with: .mediaBox, to: cg)
  }
  return try writeJpeg(image, options.colorMatrix, options.quality, out)
}

// Link annotations: a `uri`, a `page` (0-based, in this document), or both; one with neither is
// dropped. JavaScript decides which schemes may be opened.
func pageLinks(_ page: PDFPage, _ doc: PDFDocument) -> [[String: Any]] {
  var links: [[String: Any]] = []
  for annotation in page.annotations where annotation.type == "Link" {
    var uri: String? = annotation.url?.absoluteString
    var target: PDFPage? = annotation.destination?.page
    if let action = annotation.action as? PDFActionURL, uri == nil {
      uri = action.url?.absoluteString
    }
    if let action = annotation.action as? PDFActionGoTo, target == nil {
      target = action.destination.page
    }
    var dest: Int? = nil
    if let target = target {
      let index = doc.index(for: target)
      if index != NSNotFound, index >= 0, index < doc.pageCount { dest = index }
    }
    if let value = uri, value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { uri = nil }
    if uri == nil && dest == nil { continue }
    let r = toDisplay(annotation.bounds, page)
    var entry: [String: Any] = [
      "left": Double(r.minX),
      "top": Double(r.minY),
      "width": Double(r.width),
      "height": Double(r.height),
    ]
    if let uri = uri { entry["uri"] = uri }
    if let dest = dest { entry["page"] = dest }
    links.append(entry)
  }
  return links
}

// `page` is left out when the entry has no destination in this document. Depth and size are
// capped, like Android: outlines in the wild can loop.
func outlineItems(_ parent: PDFOutline, _ doc: PDFDocument, _ depth: Int, _ total: inout Int) -> [[String: Any]] {
  var items: [[String: Any]] = []
  for index in 0..<parent.numberOfChildren {
    if total >= 5000 { break }
    guard let child = parent.child(at: index) else { continue }
    total += 1
    var entry: [String: Any] = ["title": (child.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)]
    var target: PDFPage? = child.destination?.page
    if target == nil, let action = child.action as? PDFActionGoTo {
      target = action.destination.page
    }
    if let target = target {
      let pageIndex = doc.index(for: target)
      if pageIndex != NSNotFound, pageIndex >= 0, pageIndex < doc.pageCount { entry["page"] = pageIndex }
    }
    entry["children"] = depth + 1 < 12 ? outlineItems(child, doc, depth + 1, &total) : []
    items.append(entry)
  }
  return items
}

// MARK: - Images

// A scan's master (or a region of it, for a tile) to a JPEG of exactly width × height. ImageIO
// downsamples while decoding, so a 2400 px master is never held whole for a 1080 px page. EXIF
// orientation is ignored: the app's masters carry none.
func decodeImage(_ uri: URL, _ options: DecodeOptions) throws -> [String: Any] {
  try checkImageSize(options.width, options.height)
  let out = try outputURL(options.out)
  guard let source = CGImageSourceCreateWithURL(uri as CFURL, nil),
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
    let sourceW = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
    let sourceH = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
    sourceW > 0, sourceH > 0
  else {
    throw PdfReadException("Not a readable image")
  }
  var region = CGRect(x: 0, y: 0, width: sourceW, height: sourceH)
  if let r = options.region {
    region = region.intersection(CGRect(x: r.x, y: r.y, width: r.width, height: r.height))
    if region.isNull || region.width < 1 || region.height < 1 {
      throw OutOfRangeException("The region is outside the image")
    }
  }
  // Decode just large enough for the region to cover the wanted pixels.
  let wanted = max(CGFloat(options.width) / region.width, CGFloat(options.height) / region.height)
  let maxPixel = max(1, Int((max(sourceW, sourceH) * Double(min(1, wanted))).rounded(.up)))
  let thumbnail: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: false,
    kCGImageSourceShouldCacheImmediately: true,
    kCGImageSourceThumbnailMaxPixelSize: maxPixel,
  ]
  guard let decoded = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnail as CFDictionary) else {
    throw PdfReadException("Not a readable image")
  }
  let scale = CGFloat(decoded.width) / CGFloat(sourceW)
  let crop = CGRect(
    x: region.minX * scale, y: region.minY * scale, width: region.width * scale, height: region.height * scale
  ).integral.intersection(CGRect(x: 0, y: 0, width: decoded.width, height: decoded.height))
  guard let part = decoded.cropping(to: crop) else {
    throw PdfReadException("Not a readable image")
  }
  let image = pixelRenderer(options.width, options.height).image { _ in
    UIImage(cgImage: part).draw(in: CGRect(x: 0, y: 0, width: options.width, height: options.height))
  }
  return try writeJpeg(image, options.colorMatrix, options.quality, out)
}
