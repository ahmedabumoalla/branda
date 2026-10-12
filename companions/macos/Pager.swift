import AppKit
import WebKit

final class PagerPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class PagerApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var panel: PagerPanel!
    var web: WKWebView!
    var message: NSTextField!
    var owner = false
    var collapsed = false
    var expandedFrame = NSRect.zero
    var home: URL { URL(string: owner ? "https://barndaksa.com/dashboard/pager" : "https://barndaksa.com/pager")! }

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel = PagerPanel(contentRect: NSRect(x: 100, y: 100, width: 440, height: 690), styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: false)
        panel.title = "نداء برندة"
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.minSize = NSSize(width: 340, height: 100)
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        stack.translatesAutoresizingMaskIntoConstraints = false
        panel.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: panel.contentView!.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: panel.contentView!.trailingAnchor),
            stack.topAnchor.constraint(equalTo: panel.contentView!.topAnchor),
            stack.bottomAnchor.constraint(equalTo: panel.contentView!.bottomAnchor)
        ])
        let toolbar = NSStackView(views: [
            control("الدخول", #selector(login)), control("النداء", #selector(goHome)),
            control("تحديث", #selector(reload)), control("تصغير", #selector(toggleCompact))
        ])
        toolbar.spacing = 6
        stack.addArrangedSubview(toolbar)
        let mode = NSSegmentedControl(labels: ["حساب الموظف", "حساب المالك"], trackingMode: .selectOne, target: self, action: #selector(changeMode(_:)))
        mode.selectedSegment = 0
        stack.addArrangedSubview(mode)
        message = NSTextField(wrappingLabelWithString: "اسحب عنوان النافذة لتحريكها وستبقى فوق تطبيق الكاشير")
        message.alignment = .right
        message.font = .systemFont(ofSize: 12)
        stack.addArrangedSubview(message)
        let configuration = WKWebViewConfiguration()
        configuration.applicationNameForUserAgent = "BrandaPagerNative/1.0"
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(web)
        web.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -16).isActive = true
        web.setContentHuggingPriority(.defaultLow, for: .vertical)
        web.load(URLRequest(url: home))
        panel.center()
        if let screen = panel.screen { panel.setFrame(panel.frame.intersection(screen.visibleFrame), display: true) }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        let menu = NSMenu()
        let root = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "إغلاق نداء برندة", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        root.submenu = appMenu; menu.addItem(root)
        let editRoot = NSMenuItem(); let edit = NSMenu(title: "تحرير")
        edit.addItem(withTitle: "نسخ", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "لصق", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "قص", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "تحديد الكل", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editRoot.submenu = edit; menu.addItem(editRoot); NSApp.mainMenu = menu
    }
    func control(_ title: String, _ action: Selector) -> NSButton { NSButton(title: title, target: self, action: action) }
    @objc func goHome() { web.load(URLRequest(url: home)) }
    @objc func reload() { web.reload() }
    @objc func login() { web.load(URLRequest(url: URL(string: owner ? "https://barndaksa.com/login" : "https://barndaksa.com/cashier/login")!)) }
    @objc func changeMode(_ sender: NSSegmentedControl) { owner = sender.selectedSegment == 1; login() }
    @objc func toggleCompact() {
        collapsed.toggle()
        web.isHidden = collapsed
        if collapsed { expandedFrame = panel.frame; var frame = panel.frame; frame.origin.y += frame.height - 140; frame.size.height = 140; panel.setFrame(frame, display: true) }
        else { var frame = expandedFrame; frame.origin.x = panel.frame.origin.x; frame.origin.y = panel.frame.maxY - frame.height; if let screen = panel.screen { frame = frame.intersection(screen.visibleFrame) }; panel.setFrame(frame, display: true) }
    }
    static func trusted(_ url: URL?) -> Bool {
        guard let url = url else { return false }
        return url.scheme?.lowercased() == "https" && url.host?.lowercased() == "barndaksa.com" && url.user == nil && url.password == nil && (url.port == nil || url.port == 443)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(Self.trusted(navigationAction.request.url) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { message.stringValue = "تعذر الاتصال بالمنصة تحقق من الإنترنت ثم اضغط تحديث" }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { message.stringValue = "النافذة مثبتة فوق التطبيقات ويمكنك تحريكها من العنوان" }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage text: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard Self.trusted(frame.request.url) else { completionHandler(false); return }
        let alert = NSAlert(); alert.messageText = text; alert.addButton(withTitle: "تأكيد"); alert.addButton(withTitle: "رجوع")
        alert.beginSheetModal(for: panel) { completionHandler($0 == .alertFirstButtonReturn) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

if CommandLine.arguments.contains("--self-test") {
    precondition(PagerApp.trusted(URL(string: "https://barndaksa.com/pager")))
    for input in ["http://barndaksa.com", "https://barndaksa.com.evil.test/pager", "https://user@barndaksa.com/pager", "file:///tmp/test", "javascript:alert(1)", "https://barndaksa.com:444/pager"] {
        precondition(!PagerApp.trusted(URL(string: input)))
    }
    print("Navigation boundary checks passed")
} else {
    let application = NSApplication.shared
    let delegate = PagerApp()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}
