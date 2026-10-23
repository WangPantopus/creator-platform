// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "QelvoraNative",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "QelvoraUI", targets: ["QelvoraUI"]),
        .executable(name: "qelvora-native-snapshots", targets: ["NativeSnapshots"]),
    ],
    dependencies: [
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing.git", exact: "1.19.6"),
        .package(url: "https://github.com/livekit/client-sdk-swift.git", exact: "2.17.0"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "10.0.0"),
    ],
    targets: [
        .target(name: "QelvoraUI", dependencies: [.product(name: "LiveKit", package: "client-sdk-swift"), .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS", condition: .when(platforms: [.iOS]))], path: "Sources", resources: [.process("Resources"), .process("Generated/Localizable.xcstrings")]),
        .executableTarget(name: "NativeSnapshots", dependencies: ["QelvoraUI"], path: "Tools/NativeSnapshots"),
        .testTarget(name: "QelvoraUITests", dependencies: ["QelvoraUI", .product(name: "SnapshotTesting", package: "swift-snapshot-testing")]),
    ]
)
