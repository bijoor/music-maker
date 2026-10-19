import UIKit
import WebKit

/// Turns off the WKWebView's own gesture recognizers so fast taps reach the page as plain touches.
///
/// A WKWebView is a WKScrollView (pan, pinch) holding a WKContentView that carries a dozen or more recognizers:
/// - WKTouchEventsGestureRecognizer: turns UIKit touches into the page's touch and pointer events. Always kept.
/// - WKTouchActionGestureRecognizer: applies CSS touch-action. Kept: it only blocks native gestures.
/// - WKSyntheticTapGestureRecognizer and plain tap recognizers: the single tap that makes `click` (and focuses
///   fields), double-tap to zoom, double-click, two-finger tap and double tap. These are tap recognizers that watch every finger, so two fingers landing
///   close together can be taken as one multi-finger or double tap.
/// - WKDeferringGestureRecognizer ×8: hold native gestures back until the page has answered a touch (so
///   preventDefault can stop them).
/// - long press, link highlight, image analysis, lookup, drag and drop, context menu, edit menu, text selection
///   (UITextInteraction: loupe, tap-to-place-cursor) and iPad pointer/hover recognizers.
///
/// Which ones are switched off depends on `Settings.Gestures`. Recognizers are disabled, not removed, because
/// WebKit wires failure requirements between them; a disabled recognizer simply fails. WebKit re-enables some
/// (the double-tap one follows the viewport) and adds others later (text editing), so `enforce()` runs again at
/// every new touch, before UIKit hands the touch to any recognizer (see `TouchWindow`).
final class GestureStripper {
    private let mode: Settings.Gestures
    private weak var webView: WKWebView?
    private var seen = Set<ObjectIdentifier>()
    private var disabled: [UIGestureRecognizer] = []
    /// One line per recognizer found: what it is and what was done with it (shown by the tap test page).
    private(set) var report: [String] = []

    init(webView: WKWebView, mode: Settings.Gestures) {
        self.webView = webView
        self.mode = mode
        if mode != .webkit {
            webView.scrollView.isScrollEnabled = false
            webView.scrollView.bounces = false
            webView.scrollView.pinchGestureRecognizer?.isEnabled = false
            webView.scrollView.delaysContentTouches = false
            webView.scrollView.canCancelContentTouches = false
            webView.scrollView.contentInsetAdjustmentBehavior = .never
        }
        enforce()
    }

    /// Finds recognizers not seen before and decides on them; turns back off any WebKit re-enabled.
    func enforce() {
        guard mode != .webkit, let webView else { return }
        let content = webView.scrollView.subviews.first { name(of: $0).hasPrefix("WKContentView") }
        for view in [webView, webView.scrollView, content].compactMap({ $0 }) {
            for recognizer in view.gestureRecognizers ?? [] where seen.insert(ObjectIdentifier(recognizer)).inserted {
                let off = shouldDisable(recognizer, in: view, isScrollView: view === webView.scrollView)
                if off { disabled.append(recognizer) }
                report.append("\(off ? "off " : "kept") \(describe(recognizer)) on \(name(of: view))")
            }
        }
        for recognizer in disabled where recognizer.isEnabled { recognizer.isEnabled = false }
    }

    private func shouldDisable(_ r: UIGestureRecognizer, in view: UIView, isScrollView: Bool) -> Bool {
        let cls = name(of: r)
        // The one that delivers touches to the page; without it nothing works.
        if cls.contains("TouchEventsGestureRecognizer") { return false }
        if mode == .all { return true }

        // .drumming: keep only what the rest of the app needs; everything else is off, including anything that
        // watches for a second tap or finger (text double tap, tap-and-a-half) or delays touches (drag).
        if isScrollView { return true } // the page itself never scrolls or zooms; panels scroll in their own views
        if cls.contains("TouchActionGestureRecognizer") { return false }
        let label = r.name ?? ""
        // The single tap that makes clicks (buttons) and focuses fields, and the tap that closes the keyboard.
        if cls == "WKSyntheticTapGestureRecognizer", let tap = r as? UITapGestureRecognizer, tap.numberOfTapsRequired == 1, tap.numberOfTouchesRequired == 1 { return false }
        if label.contains("Keyboard dismissal") { return false }
        // WebKit names its deferrers, e.g. "Deferrer for touch end (synthetic tap)". The other deferrers hold back
        // gestures that are off now; the synthetic-tap ones make the single tap respect preventDefault on the pads.
        if cls.contains("Deferring") { return !label.contains("synthetic tap") }
        // Editing code: place the cursor, the loupe, selection handles.
        let text = ["UITextInteractionNameSingleTap", "UITextInteractionNameLoupe",
                    "UITextInteractionNameInteractiveRefinement", "UITextInteractionNameRangeAdjustment"]
        if text.contains(label) { return false }
        return true
    }

    private func describe(_ r: UIGestureRecognizer) -> String {
        var s = name(of: r)
        if let label = r.name, !label.isEmpty { s += " “\(label)”" }
        if let tap = r as? UITapGestureRecognizer { s += " (taps \(tap.numberOfTapsRequired), fingers \(tap.numberOfTouchesRequired))" }
        if !r.cancelsTouchesInView { s += " [doesn't cancel]" }
        if r.delaysTouchesBegan { s += " [delays touches]" }
        return s
    }

    private func name(of object: AnyObject) -> String { String(describing: type(of: object)) }
}
