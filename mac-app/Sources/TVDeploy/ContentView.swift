import SwiftUI
import AppKit

struct ContentView: View {
    @ObservedObject var controller: TVController

    private let actions: [(label: String, command: String, icon: String)] = [
        ("Deploy (all)", "deploy", "bolt.fill"),
        ("Find TV", "find", "wifi"),
        ("Connect", "connect", "cable.connector"),
        ("Build", "build", "hammer"),
        ("Install", "install", "square.and.arrow.down"),
        ("Launch", "launch", "play.fill"),
        ("Kill", "kill", "stop.fill"),
        ("Uninstall", "uninstall", "trash"),
        ("Status", "status", "checkmark.circle")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("IPTV Player — TV Deploy")
                .font(.headline)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(actions, id: \.command) { action in
                    Button {
                        controller.run(action.command)
                    } label: {
                        Label(action.label, systemImage: action.icon)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(controller.isRunning)
                }
            }

            Button {
                controller.toggleLogsTail()
            } label: {
                Label(controller.isTailingLogs ? "Stop Tailing Logs" : "Tail Logs",
                      systemImage: controller.isTailingLogs ? "stop.circle" : "text.alignleft")
                    .frame(maxWidth: .infinity)
            }
            .tint(controller.isTailingLogs ? .red : .accentColor)

            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    Text(controller.log)
                        .font(.system(size: 11, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .id("logBottom")
                }
                .frame(height: 260)
                .background(Color.black.opacity(0.05))
                .onChange(of: controller.log) { _ in
                    proxy.scrollTo("logBottom", anchor: .bottom)
                }
            }

            HStack {
                Spacer()
                Button("Clear Log") { controller.clearLog() }
                Button("Quit") { NSApp.terminate(nil) }
            }
        }
        .padding(14)
        .frame(width: 420)
    }
}
