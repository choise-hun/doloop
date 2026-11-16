import Capacitor
import WebKit

// Keeps Capacitor's navigation/UI delegates and URL handling intact.
final class NavigationViewController: CAPBridgeViewController {
    private var safety: SwipeNavigationSafety?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        safety = SwipeNavigationSafety(webView: webView)
    }
}

final class SwipeNavigationSafety: NSObject, WKScriptMessageHandler, UIGestureRecognizerDelegate {
    private weak var webView: WKWebView?
    private var loadingObservation: NSKeyValueObservation?
    private var generation = 0
    private var request = 0
    private let back = UIPanGestureRecognizer()
    private let forward = UIPanGestureRecognizer()

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        // Use UIKit edge recognizers with WKWebView's existing history. Keeping
        // WebKit's parallel gesture disabled prevents two history moves.
        webView.allowsBackForwardNavigationGestures = false
        for gesture in [back, forward] {
            gesture.maximumNumberOfTouches = 1
            gesture.isEnabled = false
            gesture.delegate = self
            gesture.addTarget(self, action: #selector(navigate(_:)))
            webView.addGestureRecognizer(gesture)
            webView.scrollView.panGestureRecognizer.require(toFail: gesture)
        }
        webView.configuration.userContentController.add(self, name: "redoNavigation")
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
            guard let self = self else { return }
            if view.isLoading {
                self.generation += 1
                self.setBlocked(true)
            } else {
                self.refresh()
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // A remote player iframe must never unlock the main app's navigation.
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "capacitor", origin.host == "localhost",
              let payload = message.body as? [String: Any],
              payload["document"] is String, payload["sequence"] is Int,
              let blocked = payload["blocked"] as? Bool else { return }
        // The payload is only a notification; all decisions read current state.
        if blocked { setBlocked(true) }
        refresh()
    }

    private func setBlocked(_ blocked: Bool) {
        back.isEnabled = !blocked
        forward.isEnabled = !blocked
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let view = webView else { return false }
        let x = touch.location(in: view).x
        return gestureRecognizer === back ? x <= 24 : x >= view.bounds.width - 24
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // WKContentView's touch recognizer must not prevent an edge pan.
        otherGestureRecognizer !== webView?.scrollView.panGestureRecognizer
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let view = webView, !view.isLoading else { return false }
        guard let gesture = gestureRecognizer as? UIPanGestureRecognizer else { return false }
        let movement = gesture.translation(in: view)
        guard abs(movement.x) > abs(movement.y) else { return false }
        return gesture === back ? movement.x > 0 && view.canGoBack : movement.x < 0 && view.canGoForward
    }

    @objc private func navigate(_ gesture: UIPanGestureRecognizer) {
        guard gesture.state == .ended, let view = webView else { return }
        let distance = gesture.translation(in: view).x
        guard gesture === back ? distance > 32 : distance < -32 else { return }
        if gesture === back { view.goBack() } else { view.goForward() }
    }

    private func refresh() {
        guard let view = webView, !view.isLoading,
              view.url?.scheme == "capacitor", view.url?.host == "localhost" else { return }
        request += 1
        let currentRequest = request
        let currentGeneration = generation
        view.evaluateJavaScript("window.__redoSwipeState || null") { [weak self] result, error in
            guard let self = self, let view = self.webView,
                  self.generation == currentGeneration, self.request == currentRequest, !view.isLoading else { return }
            guard error == nil, let state = result as? [String: Any],
                  state["document"] is String, state["sequence"] is Int,
                  let blocked = state["blocked"] as? Bool else {
                self.setBlocked(true)
                return
            }
            // Validate against the current JS document, not the sender's old snapshot.
            self.setBlocked(blocked)
        }
    }
}
