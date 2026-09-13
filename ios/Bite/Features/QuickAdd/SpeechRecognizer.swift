import Foundation
import Speech
import AVFoundation

/// 语音输入（zh-CN），对应 web 的 Web Speech API。按一下开始、再按一下停止，识别结果整段回调。
@MainActor
@Observable
final class SpeechRecognizer {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    var listening = false
    var isAvailable: Bool { recognizer?.isAvailable ?? false }

    func toggle(onResult: @escaping (String) -> Void) {
        if listening { stop(); return }
        Task {
            let auth = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
            guard auth == .authorized else { return }
            let mic = await AVAudioApplication.requestRecordPermission()
            guard mic else { return }
            start(onResult: onResult)
        }
    }

    private func start(onResult: @escaping (String) -> Void) {
        guard let recognizer, recognizer.isAvailable else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = false
            request = req
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in req.append(buffer) }
            engine.prepare()
            try engine.start()
            listening = true
            task = recognizer.recognitionTask(with: req) { [weak self] result, error in
                Task { @MainActor in
                    if let result, result.isFinal { onResult(result.bestTranscription.formattedString) }
                    if error != nil || (result?.isFinal ?? false) { self?.stop() }
                }
            }
        } catch {
            stop()
        }
    }

    func stop() {
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
