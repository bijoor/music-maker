import AVFoundation
import UIKit

/// The app's audio session: category `.playback`, so the app's sound plays in Silent mode and stops other apps' audio
/// (a music player) while it plays. Mixing with other apps was tried and dropped: iOS then sizes the audio buffer
/// for the other app, and the pads lag noticeably.
///
/// The session is never activated at launch (that would stop other apps' audio before anything plays); WebKit
/// activates it when the page plays. After an interruption (a call, Siri) ends it is activated again, and on every
/// return to the app the page is told to resume its sound (if iOS wants a tap first, the next tap does it).
final class AudioSession {
    static let shared = AudioSession()

    /// Called when the page should resume its AudioContext.
    var onReactivated: (() -> Void)?
    /// Called with the event log whenever it changes (shown by the bare tap test).
    var onLog: (([String]) -> Void)?
    private(set) var log: [String] = []
    private let started = Date()

    private init() {
        // Left over from the dropped "Play over other apps" setting.
        UserDefaults.standard.removeObject(forKey: "mixAudio")
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .began {
                let reason = note.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt
                self.note("interrupted (reason \(reason.map(String.init) ?? "?"))")
            } else {
                let options = AVAudioSession.InterruptionOptions(rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
                self.note("interruption ended\(options.contains(.shouldResume) ? ", should resume" : "")")
                self.reactivate(activate: true)
            }
        }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            self?.note("media services reset")
            self?.reactivate(activate: true)
        }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.note("app in the background")
        }
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.note("app back in the foreground")
            self?.reactivate(activate: false)
        }
    }

    func start() {
        setCategory()
        try? AVAudioSession.sharedInstance().setPreferredIOBufferDuration(0.005) // short buffer: lower pad latency
    }

    private func reactivate(activate: Bool) {
        setCategory()
        if activate {
            do { try AVAudioSession.sharedInstance().setActive(true); note("session active") } catch { note("could not activate: \(error.localizedDescription)") }
        }
        onReactivated?()
    }

    private func setCategory() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            note("category playback; other audio playing: \(session.isOtherAudioPlaying)")
        } catch {
            note("could not set category: \(error.localizedDescription)")
        }
    }

    private func note(_ line: String) {
        let entry = String(format: "%.1fs ", Date().timeIntervalSince(started)) + line
        NSLog("MusicMaker audio: %@", entry)
        log.append(entry)
        if log.count > 40 { log.removeFirst(log.count - 40) }
        onLog?(log)
    }
}
