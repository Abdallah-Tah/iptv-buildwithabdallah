import SwiftUI

@main
struct TVDeployApp: App {
    @StateObject private var controller = TVController()

    var body: some Scene {
        MenuBarExtra {
            ContentView(controller: controller)
        } label: {
            Image(systemName: controller.isRunning ? "antenna.radiowaves.left.and.right.circle.fill" : "tv")
        }
        .menuBarExtraStyle(.window)
    }
}
