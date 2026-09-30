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
    ],
    targets: [
        .target(name: "QelvoraUI", path: "Sources", resources: [.process("Resources"), .process("Generated/Localizable.xcstrings")]),
        .executableTarget(name: "NativeSnapshots", dependencies: ["QelvoraUI"], path: "Tools/NativeSnapshots"),
        .testTarget(name: "QelvoraUITests", dependencies: ["QelvoraUI", .product(name: "SnapshotTesting", package: "swift-snapshot-testing")]),
    ]
)
