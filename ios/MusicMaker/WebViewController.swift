import UIKit
import WebKit

/// Full-screen web view showing the Music Maker web app, with WebKit's gestures switched off (see GestureStripper).
///
/// The page can find out it runs here from `window.musicMakerNative`:
/// `{ gestures: 'webkit' | 'drumming' | 'all', relay: Bool, report: [String] }` (report: one line per WebKit gesture
/// recognizer and whether it was kept). With `relay` on, every touch the iPad reports is also sent to the page as a
/// `nativetouch` event on window, `detail: [{ id, phase: 'start' | 'end' | 'cancel', x, y, t }]` (x, y in CSS px;
/// t in ms of system uptime), whether or not WebKit delivers it as a touch event.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let settings: Settings
    private var webView: WKWebView!
    private var stripper: GestureStripper?
    private var touchIDs: [ObjectIdentifier: Int] = [:]
    private var nextTouchID = 1

    init(settings: Settings) {
        self.settings = settings
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.suppressesIncrementalRendering = false
        config.dataDetectorTypes = []
        config.userContentController.addUserScript(WKUserScript(source: bootstrapScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if settings.gestures == .all {
            config.userContentController.addUserScript(WKUserScript(source: Self.clickScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0x12 / 255, green: 0x15 / 255, blue: 0x13 / 255, alpha: 1)
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.isMultipleTouchEnabled = true
        webView.isInspectable = true // Safari → Develop → this iPad, for the web inspector
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Back from the background or an interruption: the session is active again, tell the page to resume its sound
        // (it listens for focus; if iOS wants a tap first, the next tap does it).
        AudioSession.shared.onReactivated = { [weak self] in
            self?.webView.evaluateJavaScript("dispatchEvent(new Event('focus')); 0")
        }
        AudioSession.shared.onLog = { [weak self] _ in self?.sendAudioLog() }
        stripper = GestureStripper(webView: webView, mode: settings.gestures)
        webView.load(URLRequest(url: settings.startURL))
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // Swipes from the screen edges go to the page first; iPadOS asks for a second swipe before acting on them.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    // MARK: Touches, from TouchWindow before UIKit delivers them

    func windowSaw(_ touches: Set<UITouch>, event: UIEvent) {
        if touches.contains(where: { $0.phase == .began }) { stripper?.enforce() }
        guard settings.relayTouches else { return }
        var items: [String] = []
        for touch in touches where touch.view?.isDescendant(of: webView) ?? false {
            let key = ObjectIdentifier(touch)
            let phase: String
            switch touch.phase {
            case .began:
                touchIDs[key] = nextTouchID
                nextTouchID += 1
                phase = "start"
            case .ended: phase = "end"
            case .cancelled: phase = "cancel"
            default: continue
            }
            guard let id = touchIDs[key] else { continue }
            if phase != "start" { touchIDs[key] = nil }
            let p = touch.location(in: webView)
            items.append(String(format: "{id:%d,phase:'%@',x:%.1f,y:%.1f,t:%.3f}", id, phase, p.x, p.y, touch.timestamp * 1000))
        }
        guard !items.isEmpty else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('nativetouch',{detail:[\(items.joined(separator: ","))]}))")
    }

    // MARK: Page

    /// The native audio session's recent events, for the bare tap test's results.
    private func sendAudioLog() {
        let json = (try? JSONSerialization.data(withJSONObject: AudioSession.shared.log)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        webView?.evaluateJavaScript("if (window.musicMakerNative) window.musicMakerNative.audioLog = \(json); 0")
    }

    private func bootstrapScript() -> String {
        "window.musicMakerNative = { gestures: '\(settings.gestures.rawValue)', relay: \(settings.relayTouches), report: [], audioLog: [] };"
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        stripper?.enforce()
        sendAudioLog()
        let report = (try? JSONSerialization.data(withJSONObject: stripper?.report ?? [])).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        webView.evaluateJavaScript("if (window.musicMakerNative) window.musicMakerNative.report = \(report); 0") { _, error in
            if let error { NSLog("MusicMaker report failed: %@", "\(error)") }
        }
        // For Console.app / `log stream`: what the page can use, and what was done to WebKit's gestures.
        webView.evaluateJavaScript("[location.href, 'secure ' + isSecureContext, 'AudioWorklet ' + !!window.AudioWorkletNode, 'storage ' + !!window.indexedDB, 'audioSession ' + (navigator.audioSession ? navigator.audioSession.type : 'none')].join(' · ')") { value, _ in
            NSLog("MusicMaker page: %@", "\(value ?? "?")")
        }
        for line in stripper?.report ?? [] { NSLog("MusicMaker gesture (%@): %@", settings.gestures.rawValue, line) }
    }

    /// Links to other sites (sound credits, Strudel docs) open in Safari; the app's own pages stay here.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, action.navigationType == .linkActivated else { return decisionHandler(.allow) }
        let start = settings.startURL
        if url.scheme == start.scheme && url.host == start.host && url.port == start.port { return decisionHandler(.allow) }
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    /// target=_blank links (no new windows here) also go to Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: Dialogs (alert/confirm/prompt do nothing in a WKWebView without these)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    /// With every WebKit gesture off ("All off") nothing makes `click` events any more, so this makes them: a touch
    /// that lifts where it landed, quickly, and whose touchstart the page did not preventDefault, clicks (and focuses)
    /// the element under it.
    private static let clickScript = """
    (() => {
      const down = new Map();
      addEventListener('touchstart', (e) => {
        for (const t of e.changedTouches) down.set(t.identifier, { x: t.clientX, y: t.clientY, at: e.timeStamp, skip: e.defaultPrevented });
      }, { passive: true });
      addEventListener('touchend', (e) => {
        for (const t of e.changedTouches) {
          const d = down.get(t.identifier);
          down.delete(t.identifier);
          if (!d || d.skip || e.defaultPrevented || e.timeStamp - d.at > 800 || Math.hypot(t.clientX - d.x, t.clientY - d.y) > 10) continue;
          const el = document.elementFromPoint(t.clientX, t.clientY);
          if (!el) continue;
          const field = el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
          if (field) field.focus();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: t.clientX, clientY: t.clientY, detail: 1 }));
        }
      }, { passive: true });
      addEventListener('touchcancel', (e) => { for (const t of e.changedTouches) down.delete(t.identifier); }, { passive: true });
    })();
    """
}
