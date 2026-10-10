#if os(iOS)
import SwiftUI
import UIKit

/// An edge drag must cancel the row's tap, while a vertical drag remains a scroll.
/// SwiftUI simultaneous gestures can perform both Back and the row's action.
struct NativeBackSwipe: UIViewRepresentable {
    let enabled: Bool
    let back: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> HostView {
        let view = HostView()
        view.isUserInteractionEnabled = false
        view.recognizer = context.coordinator.pan
        return view
    }

    func updateUIView(_ uiView: HostView, context: Context) {
        context.coordinator.enabled = enabled
        context.coordinator.back = back
    }

    static func dismantleUIView(_ uiView: HostView, coordinator: Coordinator) {
        uiView.detach()
    }

    final class HostView: UIView {
        var recognizer: UIPanGestureRecognizer?
        private weak var installedWindow: UIWindow?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard installedWindow !== window else { return }
            detach()
            if let window, let recognizer {
                window.addGestureRecognizer(recognizer)
                installedWindow = window
            }
        }

        func detach() {
            if let recognizer { installedWindow?.removeGestureRecognizer(recognizer) }
            installedWindow = nil
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var enabled = false
        var back: () -> Void = {}
        lazy var pan: UIPanGestureRecognizer = {
            let value = UIPanGestureRecognizer(target: self, action: #selector(changed))
            value.maximumNumberOfTouches = 1
            value.cancelsTouchesInView = true
            value.delegate = self
            return value
        }()

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            // Presented sheets own their dismissal; never navigate underneath one.
            guard let window = gestureRecognizer.view as? UIWindow,
                  window.rootViewController?.presentedViewController == nil else { return false }
            return enabled && touch.location(in: window).x < 24
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            let velocity = pan.velocity(in: pan.view)
            return enabled && velocity.x > 0 && velocity.x > abs(velocity.y)
        }

        // Let this edge-only recognizer decide before a button or scroll pan.
        // Outside the edge, or on a vertical drag, it fails and they proceed.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            true
        }

        @objc private func changed() {
            guard pan.state == .ended, enabled else { return }
            let translation = pan.translation(in: pan.view)
            if translation.x > 70 && abs(translation.y) < 60 { back() }
        }
    }
}
#endif
