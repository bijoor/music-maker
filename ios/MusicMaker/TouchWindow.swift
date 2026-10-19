import UIKit

/// The app's window. Every touch the iPad reports passes through `sendEvent` before any gesture recognizer or view
/// sees it, so this is the ground truth for "did the finger land?": a touch seen here but never reaching the page
/// as a touchstart was lost inside WebKit.
final class TouchWindow: UIWindow {
    /// Called with each touch that begins, ends or is cancelled, before UIKit delivers the event.
    var onTouches: ((_ touches: Set<UITouch>, _ event: UIEvent) -> Void)?

    override func sendEvent(_ event: UIEvent) {
        if event.type == .touches, let touches = event.allTouches {
            onTouches?(touches, event)
        }
        super.sendEvent(event)
    }
}
