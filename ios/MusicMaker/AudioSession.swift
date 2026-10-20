import AVFoundation
import UIKit

/// The app's audio session. WebKit plays the page's sound through it, so it decides whether that sound stops other
/// apps' audio (a music player) or plays over it, and it has to be active again after the app comes back from the
/// background or an interruption (a call, Siri, another app taking the audio) before the page can resume its sound.
///
/// Category `.playback` either way, so sound plays in Silent mode; with "Play over other apps" on (More menu, kept by
/// the page in localStorage 'music-maker:mixAudio') it adds `.mixWithOthers`. The page reports the setting through
/// the `musicMakerAudio` script message (see WebViewController).
final class AudioSession {
    static let shared = AudioSession()

    private(set) var mixWithOthers = false
    /// Called after the session is active again, so the page can resume its AudioContext.
    var onReactivated: (() -> Void)?

    private init() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            self?.reactivate(because: "interruption ended")
        }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            self?.reactivate(because: "media services reset")
        }
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.reactivate(because: "back in the foreground")
        }
    }

    func start() {
        apply()
        try? AVAudioSession.sharedInstance().setPreferredIOBufferDuration(0.005) // short buffer: lower pad latency
    }

    func setMixWithOthers(_ on: Bool) {
        guard on != mixWithOthers else { return }
        mixWithOthers = on
        apply()
    }

    private func reactivate(because reason: String) {
        apply()
        NSLog("MusicMaker audio: session active again (%@)", reason)
        onReactivated?()
    }

    private func apply() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: mixWithOthers ? [.mixWithOthers] : [])
            try session.setActive(true)
        } catch {
            NSLog("MusicMaker audio: %@", "\(error)")
        }
        NSLog("MusicMaker audio: %@, %@", session.category.rawValue, mixWithOthers ? "mixes with other apps" : "stops other apps")
    }
}
