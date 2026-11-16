import XCTest

final class NativeUITests: XCTestCase {
    private var app: XCUIApplication!
    private var currentPage: String?
    private var visits: [String: Int] = [:]
    override func setUpWithError() throws {
        continueAfterFailure = false
        let configured = ProcessInfo.processInfo.environment["UXN_APP_ID"] ?? ""
        app = XCUIApplication(bundleIdentifier: configured.isEmpty ? "com.ulevelp.redo" : configured)
        app.launch()
        acceptOpenPrompt()
    }
    private func acceptOpenPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let open = springboard.alerts.containing(NSPredicate(format: "label CONTAINS %@", "RE:DO")).buttons.matching(NSPredicate(format: "label IN %@", ["Open", "열기"])).firstMatch
        if open.waitForExistence(timeout: 2) { open.tap() }
    }
    private func text(_ value: String) {
        XCTAssertTrue(app.staticTexts[value].waitForExistence(timeout: 15), "Missing: \(value)\n\(app.debugDescription)")
    }
    private func tap(_ title: String) {
        let button = app.buttons[title]
        XCTAssertTrue(button.waitForExistence(timeout: 10))
        button.tap()
    }
    private func page(_ name: String) {
        if currentPage != name { visits[name, default: 0] += 1; currentPage = name }
        text("Page \(name).html")
        text("Visit \(name).html \(visits[name]!)")
    }
    private func edge(back: Bool) {
        let from = app.coordinate(withNormalizedOffset: CGVector(dx: back ? 0.01 : 0.99, dy: 0.5))
        let to = app.coordinate(withNormalizedOffset: CGVector(dx: back ? 0.95 : 0.05, dy: 0.5))
        from.press(forDuration: 0, thenDragTo: to, withVelocity: .fast, thenHoldForDuration: 0)
    }
    private func reset() {
        text("Native fixture ready")
        tap("Reset fixture")
        currentPage = nil; visits = [:]
        page("index")
        text("Native fixture ready")
    }
    private func deliver(_ query: String) {
        let port = Int(ProcessInfo.processInfo.environment["UXN_CALLBACK_PORT"] ?? "") ?? 48173
        let done = expectation(description: "OS callback delivered")
        let url = URL(string: "http://127.0.0.1:\(port)/callback?\(query)")!
        URLSession.shared.dataTask(with: url) { _, response, error in
            XCTAssertNil(error)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 20)
        acceptOpenPrompt()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }
    private func authContains(_ value: String) {
        let predicate = NSPredicate(format: "label CONTAINS %@", value)
        XCTAssertTrue(app.staticTexts.matching(predicate).firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    }

    func testInputFocusAndPinch() {
        text("Native fixture ready")
        app.links["Go input probe"].tap()
        text("Input zoom probe")
        for title in ["Probe URL one", "Probe URL two"] {
            let input = app.textFields[title]
            XCTAssertTrue(input.waitForExistence(timeout: 10))
            input.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
            input.typeText("https://youtu.be/test")
            text("Scale 1.000")
            text("Input font 16px")
            app.buttons["Done editing"].tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10))
            text("Scale 1.000")
        }
        let viewport = app.webViews.firstMatch
        viewport.pinch(withScale: 1.7, velocity: 1)
        let enlarged = NSPredicate { _, _ in
            let label = self.app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Scale ")).firstMatch.label
            return (Double(label.replacingOccurrences(of: "Scale ", with: "")) ?? 0) > 1.2
        }
        expectation(for: enlarged, evaluatedWith: nil)
        waitForExpectations(timeout: 10)
        viewport.pinch(withScale: 0.25, velocity: -2)
        text("Scale 1.000")
        text("Input zoom probe") // pinch must not navigate back to the fixture home
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
    }

    func testProductLoopControls() {
        let player = app.links["PLAYER"].firstMatch
        XCTAssertTrue(player.waitForExistence(timeout: 15))
        player.tap()
        let off = app.switches.matching(NSPredicate(format: "label IN %@", ["대기 없음", "No Wait"])).firstMatch
        for _ in 0..<6 {
            if off.exists && off.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(off.waitForExistence(timeout: 10))
        XCTAssertTrue(off.isHittable)
        let preset = app.otherElements.matching(NSPredicate(format: "label IN %@", ["프리셋 선택", "Select Preset"])).firstMatch
        XCTAssertTrue(preset.exists)
        XCTAssertEqual(preset.frame.minY, off.frame.minY, accuracy: 1)
        let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["구간 프리셋 저장", "Save Preset"])).firstMatch
        XCTAssertTrue(save.exists)
        XCTAssertGreaterThan(save.frame.minY, off.frame.maxY)
        off.tap()
        let on = app.switches.matching(NSPredicate(format: "label IN %@", ["3초 대기", "3s Wait"])).firstMatch
        XCTAssertTrue(on.waitForExistence(timeout: 10))
        on.tap()
        XCTAssertTrue(off.waitForExistence(timeout: 10))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
    }

    func testProductLaunch() {
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 20))
        XCTAssertTrue(app.webViews.links.firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.staticTexts["Native fixture ready"].exists)
        app.terminate(); app.launch()
        XCTAssertTrue(app.webViews.links.firstMatch.waitForExistence(timeout: 20))
    }

    func testHistoryAndProtection() {
        reset()
        edge(back: true); page("index")
        app.links["Go settings"].tap(); page("settings")
        app.links["Go log"].tap(); page("log")
        edge(back: true); page("settings")
        edge(back: false); page("log")
        for reason in ["recording", "upload", "take", "note"] {
            tap("Lock \(reason)"); text("Locked \(reason)")
            edge(back: true); page("log")
            tap("Unlock"); text("Unlocked")
        }
        tap("Open modal"); text("Modal open")
        edge(back: true); page("log")
        tap("Close modal")
        edge(back: true); page("settings")
        app.links["Go practice"].tap(); page("practice")
        edge(back: false); page("practice") // previous forward branch is gone
        edge(back: true); page("settings")
        edge(back: false); page("practice")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
    }

    func testSameDocumentHistoryAndCentralDrag() {
        reset()
        app.links["Go settings"].tap(); page("settings")
        tap("SPA push"); text("SPA pushed")
        tap("SPA replace"); text("SPA replaced")
        edge(back: true)
        text("URL []") // popstate reflects original settings without query
        edge(back: false)
        text("URL [?v=test&t=19&a=12&b=48&r=0.75#account]")
        let web = app.webViews.firstMatch
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.3)).press(forDuration: 0.1, thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.3)))
        page("settings")
    }

    func testColdAndWarmOAuth() {
        reset()
        tap("Login"); authContains("guest Profile none waiting")
        app.terminate()
        deliver("code=A")
        authContains("Auth A Profile A idle Exchanges 1")
        deliver("code=A")
        authContains("Auth A Profile A idle Exchanges 1")
        tap("Logout"); authContains("Auth guest Profile none idle")
        tap("Login"); authContains("waiting")
        deliver("code=B")
        authContains("Auth B Profile B idle Exchanges 2")
        tap("Logout"); tap("Login"); authContains("waiting")
        tap("Logout"); authContains("Auth guest Profile none idle")
        deliver("code=A")
        authContains("Auth guest Profile none idle Exchanges 2")
    }

    func testAccountRaceAndRefresh() {
        reset()
        tap("Hold A profile"); tap("Login"); authContains("waiting")
        deliver("code=A")
        authContains("Auth A Profile none idle")
        tap("Switch B"); authContains("Auth B Profile B idle")
        tap("Release A profile"); authContains("Auth B Profile B idle")
        tap("Refresh token"); text("Token refreshed"); authContains("Auth B Profile B idle")
        tap("Expire token"); text("Token expired"); authContains("Auth guest Profile none idle")
    }
}
