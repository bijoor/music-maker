import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the web app built into the app bundle (`web/`, copied from `dist/` at build time) at
/// musicmaker://app/music-maker/…, the same paths it has on GitHub Pages, so the web build needs no changes.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "musicmaker"
    static let base = "/music-maker/"
    static let startURL = URL(string: "\(scheme)://app\(base)")!

    private let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path(percentEncoded: false) // keeps the trailing slash, unlike url.path
        if path + "/" == Self.base { path = "" } else if path.hasPrefix(Self.base) { path.removeFirst(Self.base.count) } else if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }

        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            task.didReceive(response)
            task.didReceive(Data("Not found: \(path)".utf8))
            return task.didFinish()
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
