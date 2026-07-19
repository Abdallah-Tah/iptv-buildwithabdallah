import Foundation

final class TVController: ObservableObject {
    @Published var log: String = "Ready.\n"
    @Published var isRunning: Bool = false
    @Published var isTailingLogs: Bool = false

    private let scriptPath = "/Users/amohamed/projects/iptv-player/tvctl.sh"
    private let projectDir = "/Users/amohamed/projects/iptv-player"

    private var currentProcess: Process?
    private var logProcess: Process?

    func run(_ command: String) {
        guard !isRunning else { return }
        isRunning = true
        appendLog("\n$ tvctl.sh \(command)\n")

        let process = makeProcess(arguments: [scriptPath, command])
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.appendLog(text) }
        }

        process.terminationHandler = { [weak self] proc in
            pipe.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async {
                self?.appendLog("\n[exit code \(proc.terminationStatus)]\n")
                self?.isRunning = false
            }
        }

        currentProcess = process
        do {
            try process.run()
        } catch {
            appendLog("Failed to run: \(error.localizedDescription)\n")
            isRunning = false
        }
    }

    func toggleLogsTail() {
        if isTailingLogs {
            logProcess?.terminate()
            logProcess = nil
            isTailingLogs = false
            appendLog("\n[log tail stopped]\n")
            return
        }

        appendLog("\n$ tvctl.sh logs\n")
        let process = makeProcess(arguments: [scriptPath, "logs"])
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.appendLog(text) }
        }
        process.terminationHandler = { [weak self] _ in
            pipe.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async { self?.isTailingLogs = false }
        }

        logProcess = process
        isTailingLogs = true
        do {
            try process.run()
        } catch {
            appendLog("Failed to tail logs: \(error.localizedDescription)\n")
            isTailingLogs = false
        }
    }

    func clearLog() {
        log = ""
    }

    private func makeProcess(arguments: [String]) -> Process {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = arguments
        process.currentDirectoryURL = URL(fileURLWithPath: projectDir)
        return process
    }

    private func appendLog(_ text: String) {
        log += text
        if log.count > 20000 {
            log = String(log.suffix(20000))
        }
    }
}
