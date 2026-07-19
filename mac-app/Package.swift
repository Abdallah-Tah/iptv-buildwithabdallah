// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "TVDeploy",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "TVDeploy",
            path: "Sources/TVDeploy"
        )
    ]
)
