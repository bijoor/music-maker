import Foundation

/// The wrapper's options, set in the iPad's Settings app (Settings → Music Maker+), read once at launch.
struct Settings {
    enum Gestures: String {
        /// WebKit as shipped: what Safari and the Home Screen app do. For before/after comparisons.
        case webkit
        /// Everything that can hold back or swallow a tap is off; plain taps (clicks), scrolling inside panels and
        /// text editing stay, so the whole app still works.
        case drumming
        /// Only the recognizer that turns touches into touch/pointer events is left. Clicks are synthesised by an
        /// injected script; text selection, panel scrolling by flick and long-press menus are gone.
        case all
    }

    enum Source: String {
        case bundled, published, custom
    }

    let gestures: Gestures
    let relayTouches: Bool
    let source: Source
    let customURL: URL?

    static func load() -> Settings {
        let d = UserDefaults.standard
        let custom = d.string(forKey: "customURL")?.trimmingCharacters(in: .whitespaces) ?? ""
        return Settings(
            gestures: Gestures(rawValue: d.string(forKey: "gestures") ?? "") ?? .drumming,
            relayTouches: d.object(forKey: "relay") as? Bool ?? true,
            source: Source(rawValue: d.string(forKey: "source") ?? "") ?? .bundled,
            customURL: custom.isEmpty ? nil : URL(string: custom.contains("://") ? custom : "http://" + custom)
        )
    }

    static let publishedURL = URL(string: "https://bijoor.github.io/music-maker/")!

    /// Where the web app opens: the built-in copy unless another source is chosen (and valid).
    var startURL: URL {
        switch source {
        case .bundled: BundleSchemeHandler.startURL
        case .published: Settings.publishedURL
        case .custom: customURL ?? BundleSchemeHandler.startURL
        }
    }
}
