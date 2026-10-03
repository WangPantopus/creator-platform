import Foundation

/// A cold process has no live content decoder. Remove only this downloader's
/// direct private files before registering its screens or creating new bytes.
@MainActor enum ContentMediaCache {
    private static var prepared = false
    static func prepare() -> Bool {
        if prepared { return true }
        let manager = FileManager.default
        do {
            let keys: Set<URLResourceKey> = [.isRegularFileKey, .isSymbolicLinkKey]
            let files = try manager.contentsOfDirectory(at: manager.temporaryDirectory, includingPropertiesForKeys: Array(keys))
            for file in files {
                let stem = file.deletingPathExtension().lastPathComponent
                guard ["m4a", "png"].contains(file.pathExtension), stem.hasPrefix("w5-content-") else { continue }
                let identifier = String(stem.dropFirst("w5-content-".count))
                guard let id = UUID(uuidString: identifier), id.uuidString.caseInsensitiveCompare(identifier) == .orderedSame else { continue }
                let values = try file.resourceValues(forKeys: keys)
                guard values.isSymbolicLink != true, values.isRegularFile == true else { continue }
                try manager.removeItem(at: file)
            }
            prepared = true
            return true
        } catch { return false }
    }
}
