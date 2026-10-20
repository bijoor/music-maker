import AVFoundation
import UIKit

/// The app's audio session: category `.playback`, so the app's sound plays in Silent mode and stops other apps' audio
/// (a music player) while it plays. Mixing with other apps was tried and dropped: iOS then sizes the audio buffer
/// for the other app, and the pads lag noticeably.
///
/// The audio buffer is asked to be one Web Audio render block (128 frames, 2.7 ms at 48 kHz), as small as Safari
/// gets; iOS may hand out a larger one when the session is activated or the route changes, so `keepBufferSmall()`
/// asks again whenever the buffer in use is larger (WebViewController calls it every second).
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
            self?.keepBufferSmall()
            self?.onReactivated?()
        }
    }

    func start() {
        setCategory()
        keepBufferSmall()
    }

    /// One Web Audio render block at the current sample rate.
    private var wantedBuffer: TimeInterval { 128 / max(AVAudioSession.sharedInstance().sampleRate, 8000) }

    /// Asks for the small buffer again if the one in use is larger (and was not already asked for at this rate).
    func keepBufferSmall() {
        let session = AVAudioSession.sharedInstance()
        let wanted = wantedBuffer
        guard session.ioBufferDuration > wanted * 1.5 || abs(session.preferredIOBufferDuration - wanted) > 0.0002 else { return }
        do {
            try session.setPreferredIOBufferDuration(wanted)
            if session.ioBufferDuration > wanted * 1.5 { note(String(format: "asked for a %.1f ms buffer, have %.1f ms", wanted * 1000, session.ioBufferDuration * 1000)) }
        } catch {
            note("could not set the buffer: \(error.localizedDescription)")
        }
    }

    /// What the page's About panel shows about the native side (milliseconds, Hz).
    var info: [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return [
            "buffer": session.ioBufferDuration * 1000,
            "askedBuffer": session.preferredIOBufferDuration * 1000,
            "output": session.outputLatency * 1000,
            "rate": session.sampleRate,
            "route": session.currentRoute.outputs.map(\.portName).joined(separator: ", "),
        ]
    }

    private func reactivate(activate: Bool) {
        setCategory()
        if activate {
            do { try AVAudioSession.sharedInstance().setActive(true); note("session active") } catch { note("could not activate: \(error.localizedDescription)") }
        }
        keepBufferSmall()
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
