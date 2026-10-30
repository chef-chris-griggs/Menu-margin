import SafariServices
import SwiftUI
import UIKit
import WebKit
import VisionKit

private enum MenuTab: String, CaseIterable, Identifiable {
    case costing
    case recipes
    case pricebook
    case invoices
    case menu

    var id: String { rawValue }

    var title: String {
        switch self {
        case .costing: "Cost"
        case .recipes: "Recipes"
        case .pricebook: "Prices"
        case .invoices: "Scan"
        case .menu: "Menu"
        }
    }

    var symbol: String {
        switch self {
        case .costing: "plus.circle"
        case .recipes: "book.closed"
        case .pricebook: "list.bullet.rectangle"
        case .invoices: "doc.viewfinder"
        case .menu: "line.3.horizontal"
        }
    }

    var webButtonID: String { "tab-\(rawValue)" }
}

private enum MenuCommand {
    case refreshSync
    case manageBilling
    case exportCSV
    case exportBackup
    case printPDF
    case chooseInvoiceFile
    case importScannedInvoice(Data)
    case signOut
    case deleteAccount(email: String, confirmation: String)
}

private struct MenuCommandRequest: Identifiable {
    let id = UUID()
    let command: MenuCommand
}

private struct ShareFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ExternalPage: Identifiable {
    let id = UUID()
    let url: URL
}

private struct AppAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

struct ContentView: View {
    @State private var selectedTab: MenuTab = .costing
    @State private var hasAppAccess = false
    @State private var needsSubscription = false
    @State private var isLoading = true
    @State private var loadFailure: String?
    @State private var accountEmail: String?
    @State private var retryID = UUID()
    @State private var commandRequest: MenuCommandRequest?
    @State private var deletionInProgress = false
    @State private var deletionMessage: String?
    @State private var appAlert: AppAlert?
    @State private var showingInvoiceCamera = false
    @State private var shareFile: ShareFile?
    @State private var externalPage: ExternalPage?

    var body: some View {
        ZStack {
            if let loadFailure {
                OfflineView(message: loadFailure, retry: retry)
            } else {
                MenuMarginWebView(
                    selectedTab: $selectedTab,
                    hasAppAccess: $hasAppAccess,
                    needsSubscription: $needsSubscription,
                    isLoading: $isLoading,
                    loadFailure: $loadFailure,
                    accountEmail: $accountEmail,
                    retryID: retryID,
                    requestedCommand: commandRequest,
                    onShare: { shareFile = ShareFile(url: $0) },
                    onOpenExternal: openExternal,
                    onDeleteResult: handleDeleteResult
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay {
                    if isLoading {
                        ProgressView("Opening MenuMargin…")
                            .padding(.horizontal, 20)
                            .padding(.vertical, 16)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }

                if selectedTab == .menu && hasAppAccess {
                    MenuSettingsView(
                        accountEmail: accountEmail,
                        deletionInProgress: $deletionInProgress,
                        deletionMessage: $deletionMessage,
                        onRefreshSync: { send(.refreshSync) },
                        onManageBilling: { send(.manageBilling) },
                        onExportCSV: { send(.exportCSV) },
                        onExportBackup: { send(.exportBackup) },
                        onPrintPDF: { send(.printPDF) },
                        onSignOut: { send(.signOut) },
                        onDeleteAccount: { email, confirmation in
                            deletionInProgress = true
                            deletionMessage = nil
                            send(.deleteAccount(email: email, confirmation: confirmation))
                        },
                        onOpenRecipesBackup: { selectedTab = .recipes },
                        onOpenHelp: { openExternal(sitePage("help.html")) },
                        onOpenPrivacy: { openExternal(sitePage("privacy.html")) },
                        onOpenTerms: { openExternal(sitePage("terms.html")) }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.opacity)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.957, green: 0.965, blue: 0.953))
        .safeAreaInset(edge: .top, spacing: 0) {
            if selectedTab == .invoices && hasAppAccess && !needsSubscription && loadFailure == nil {
                HStack {
                    Label("Invoice scanner", systemImage: "doc.text.viewfinder")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.menuMarginGreen)
                    Spacer()
                    Button {
                        if VNDocumentCameraViewController.isSupported {
                            showingInvoiceCamera = true
                        } else {
                            send(.chooseInvoiceFile)
                            appAlert = AppAlert(title: "Camera scan unavailable", message: "This device cannot use the document camera. You can still choose a PDF or invoice photo in the scanner.")
                        }
                    } label: {
                        Label("Scan invoice", systemImage: "camera.viewfinder")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.menuMarginGreen)
                    .accessibilityHint("Opens the iPhone document camera and sends the scan to MenuMargin's invoice reader")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(.regularMaterial)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if hasAppAccess && loadFailure == nil {
                NativeTabBar(selection: $selectedTab, needsSubscription: needsSubscription)
            }
        }
        .sheet(item: $shareFile) { file in
            ShareSheet(url: file.url)
        }
        .sheet(item: $externalPage) { page in
            SafariPage(url: page.url)
                .ignoresSafeArea()
        }
        .sheet(isPresented: $showingInvoiceCamera) {
            InvoiceDocumentScanner(
                onComplete: { data in
                    showingInvoiceCamera = false
                    send(.importScannedInvoice(data))
                },
                onCancel: { showingInvoiceCamera = false },
                onFailure: { message in
                    showingInvoiceCamera = false
                    appAlert = AppAlert(title: "Invoice scan failed", message: message)
                }
            )
            .ignoresSafeArea()
        }
        .alert(item: $appAlert) { alert in
            Alert(
                title: Text(alert.title),
                message: Text(alert.message),
                dismissButton: .default(Text("OK"))
            )
        }
    }

    private func retry() {
        loadFailure = nil
        isLoading = true
        retryID = UUID()
    }

    private func send(_ command: MenuCommand) {
        commandRequest = MenuCommandRequest(command: command)
    }

    private func sitePage(_ page: String) -> URL {
        URL(string: "https://chef-chris-griggs.github.io/Menu-margin/\(page)")!
    }

    private func handleDeleteResult(_ succeeded: Bool, _ message: String) {
        deletionInProgress = false
        if succeeded {
            accountEmail = nil
            hasAppAccess = false
            needsSubscription = false
            selectedTab = .costing
            appAlert = AppAlert(title: "Account deleted", message: message)
        } else {
            deletionMessage = message
        }
    }

    private func openExternal(_ url: URL) {
        if url.scheme == "mailto" || url.scheme == "tel" {
            UIApplication.shared.open(url)
        } else {
            externalPage = ExternalPage(url: url)
        }
    }
}

private struct NativeTabBar: View {
    @Binding var selection: MenuTab
    let needsSubscription: Bool

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MenuTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.symbol)
                            .font(.system(size: 20, weight: .semibold))
                        Text(tab.title)
                            .font(.system(size: 10, weight: selection == tab ? .semibold : .medium))
                    }
                    .foregroundStyle(selection == tab ? Color.menuMarginGreen : Color.secondary)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(needsSubscription && tab != .menu)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selection == tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 7)
        .padding(.bottom, 5)
        .background(Color.white.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.black.opacity(0.08))
                .frame(height: 0.5)
        }
    }
}

private struct MenuSettingsView: View {
    let accountEmail: String?
    @Binding var deletionInProgress: Bool
    @Binding var deletionMessage: String?
    let onRefreshSync: () -> Void
    let onManageBilling: () -> Void
    let onExportCSV: () -> Void
    let onExportBackup: () -> Void
    let onPrintPDF: () -> Void
    let onSignOut: () -> Void
    let onDeleteAccount: (String, String) -> Void
    let onOpenRecipesBackup: () -> Void
    let onOpenHelp: () -> Void
    let onOpenPrivacy: () -> Void
    let onOpenTerms: () -> Void

    @State private var showingDeleteAccount = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Menu")
                        .font(.largeTitle.bold())
                    Text("Account, exports and help")
                        .foregroundStyle(.secondary)
                }

                settingsCard {
                    Label("Account", systemImage: "person.crop.circle")
                        .font(.headline)
                    Text(accountEmail ?? "Signed in")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    actionRow("Refresh & sync", systemImage: "arrow.clockwise", action: onRefreshSync)
                    actionRow("Manage billing", systemImage: "creditcard", action: onManageBilling)
                    actionRow("Sign out", systemImage: "rectangle.portrait.and.arrow.right", action: onSignOut)
                }

                settingsCard {
                    Label("Export and print", systemImage: "square.and.arrow.up")
                        .font(.headline)
                    Text("Exports open the iPhone share sheet. Choose Save to Files, send a copy, or Print.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    actionRow("Export recipe as CSV", systemImage: "tablecells", action: onExportCSV)
                    actionRow("Save account backup", systemImage: "externaldrive", action: onExportBackup)
                    actionRow("Print / save recipe as PDF", systemImage: "doc.richtext", action: onPrintPDF)
                    actionRow("Open recipes", systemImage: "book.closed", action: onOpenRecipesBackup)
                }

                settingsCard {
                    Label("Help and policies", systemImage: "questionmark.circle")
                        .font(.headline)
                    actionRow("Help & contact", systemImage: "lifepreserver", action: onOpenHelp)
                    actionRow("Privacy", systemImage: "hand.raised", action: onOpenPrivacy)
                    actionRow("Terms", systemImage: "doc.text", action: onOpenTerms)
                }

                settingsCard {
                    Label("Delete account", systemImage: "person.crop.circle.badge.xmark")
                        .font(.headline)
                        .foregroundStyle(.red)
                    Text("Permanently delete your account and cloud data from MenuMargin.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button(role: .destructive) {
                        showingDeleteAccount = true
                    } label: {
                        Label(deletionInProgress ? "Deleting account…" : "Delete account", systemImage: "trash")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .disabled(deletionInProgress)
                    .padding(.top, 4)
                    if let deletionMessage {
                        Text(deletionMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 620)
            .frame(maxWidth: .infinity)
        }
        .background(Color(red: 0.957, green: 0.965, blue: 0.953))
        .sheet(isPresented: $showingDeleteAccount) {
            DeleteAccountSheet(
                accountEmail: accountEmail ?? "",
                isDeleting: deletionInProgress,
                onCancel: { showingDeleteAccount = false },
                onConfirm: { email, confirmation in
                    showingDeleteAccount = false
                    onDeleteAccount(email, confirmation)
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private func settingsCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 13, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 16))
    }

    private func actionRow(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.menuMarginGreen)
        .padding(.vertical, 5)
    }
}

private struct DeleteAccountSheet: View {
    let accountEmail: String
    let isDeleting: Bool
    let onCancel: () -> Void
    let onConfirm: (String, String) -> Void

    @State private var enteredEmail = ""
    @State private var confirmation = ""

    private var canDelete: Bool {
        !accountEmail.isEmpty && enteredEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == accountEmail.lowercased() && confirmation == "DELETE" && !isDeleting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("This permanently deletes your MenuMargin account and cloud data. Export a backup first if you may need your recipes or prices.")
                        .fixedSize(horizontal: false, vertical: true)
                    Text("You’ll be asked to sign in again if your session is older than 15 minutes.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Confirm account") {
                    TextField("Account email", text: $enteredEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                    TextField("Type DELETE", text: $confirmation)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }

                Section {
                    Button(role: .destructive) {
                        onConfirm(enteredEmail.trimmingCharacters(in: .whitespacesAndNewlines), confirmation)
                    } label: {
                        HStack {
                            Spacer()
                            if isDeleting { ProgressView().padding(.trailing, 6) }
                            Text("Permanently delete account")
                            Spacer()
                        }
                    }
                    .disabled(!canDelete)
                }
            }
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
    }
}

private struct OfflineView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 38, weight: .medium))
                .foregroundStyle(Color.menuMarginGreen)
            Text("MenuMargin is unavailable")
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.menuMarginGreen)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(action: retry) {
                Label("Try again", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.menuMarginGreen)
            .padding(.top, 4)
        }
        .padding(28)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.957, green: 0.965, blue: 0.953))
    }
}

private struct MenuMarginWebView: UIViewRepresentable {
    @Binding var selectedTab: MenuTab
    @Binding var hasAppAccess: Bool
    @Binding var needsSubscription: Bool
    @Binding var isLoading: Bool
    @Binding var loadFailure: String?
    @Binding var accountEmail: String?

    let retryID: UUID
    let requestedCommand: MenuCommandRequest?
    let onShare: (URL) -> Void
    let onOpenExternal: (URL) -> Void
    let onDeleteResult: (Bool, String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "menuMargin")
        contentController.addUserScript(
            WKUserScript(
                source: Self.nativeShellScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive
        webView.backgroundColor = UIColor(red: 0.957, green: 0.965, blue: 0.953, alpha: 1)
        webView.isOpaque = false
        if #available(iOS 16.4, *) {
            #if DEBUG
            webView.isInspectable = true
            #endif
        }

        context.coordinator.webView = webView
        context.coordinator.lastRetryID = retryID
        webView.load(URLRequest(url: Self.appURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        if coordinator.lastNativeSelection != selectedTab {
            coordinator.lastNativeSelection = selectedTab
            if selectedTab != .menu {
                webView.evaluateJavaScript("document.getElementById('\(selectedTab.webButtonID)')?.click();")
            }
        }

        if let requestedCommand, coordinator.lastCommandID != requestedCommand.id {
            coordinator.lastCommandID = requestedCommand.id
            coordinator.perform(requestedCommand.command, in: webView)
        }

        if coordinator.lastRetryID != retryID {
            coordinator.lastRetryID = retryID
            webView.load(URLRequest(url: Self.appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "menuMargin")
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        coordinator.webView = nil
    }

    private static let appURL = URL(string: "https://chef-chris-griggs.github.io/Menu-margin/")!
    private static let trustedHost = appURL.host!

    private static let nativeShellScript = #"""
    (() => {
      const installNativeStyles = () => {
        const root = document.head || document.documentElement;
        if (!root || document.getElementById('mmNativeShellStyles')) return;
        const style = document.createElement('style');
        style.id = 'mmNativeShellStyles';
        style.textContent = '.app-nav{display:none!important}#mmInstallApp{display:none!important}body{padding-bottom:18px!important}.mobile-summary{bottom:0!important}';
        root.appendChild(style);
      };
      const reportState = () => {
        const body = document.body;
        if (!body || !window.webkit?.messageHandlers?.menuMargin) return;
        window.webkit.messageHandlers.menuMargin.postMessage({
          type: 'state',
          activeView: body.dataset.activeView || 'costing',
          authenticated: typeof mmUser !== 'undefined' && Boolean(mmUser),
          paymentRequired: body.classList.contains('mm-payment-required'),
          email: typeof mmUser !== 'undefined' ? (mmUser?.email || null) : null
        });
      };
      const originalOpen = window.open.bind(window);
      window.open = (url, target, features) => {
        if ((url === '' || url == null) && target === '_blank') {
          let html = '';
          return {
            document: {
              open() {},
              write(value) { html += String(value); },
              close() {}
            },
            focus() {},
            print() {
              window.webkit.messageHandlers.menuMargin.postMessage({ type: 'printHTML', html });
            }
          };
        }
        return originalOpen(url, target, features);
      };
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        if (this.download && this.href.startsWith('blob:')) {
          const filename = this.download || 'MenuMargin export';
          fetch(this.href).then(response => response.blob()).then(blob => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataURL = String(reader.result || '');
              window.webkit.messageHandlers.menuMargin.postMessage({
                type: 'file',
                filename,
                mimeType: blob.type || 'application/octet-stream',
                base64: dataURL.slice(dataURL.indexOf(',') + 1)
              });
            };
            reader.readAsDataURL(blob);
          }).catch(error => console.error('Could not prepare MenuMargin export:', error));
          return;
        }
        return originalAnchorClick.call(this);
      };
      installNativeStyles();
      const observeApp = () => {
        if (!document.body) return;
        new MutationObserver(reportState).observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'data-active-view']
        });
        reportState();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeApp, { once: true });
      } else {
        observeApp();
      }
      document.addEventListener('DOMContentLoaded', installNativeStyles, { once: true });
      setTimeout(reportState, 500);
    })();
    """#

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
        var parent: MenuMarginWebView
        weak var webView: WKWebView?
        var lastNativeSelection: MenuTab?
        var lastRetryID: UUID?
        var lastCommandID: UUID?
        private var downloadLocations: [ObjectIdentifier: URL] = [:]
        private var printWebView: WKWebView?
        private var pendingPrintHTML = false

        init(parent: MenuMarginWebView) {
            self.parent = parent
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let payload = message.body as? [String: Any], let type = payload["type"] as? String else { return }
            if type == "file" {
                receiveFile(payload)
                return
            }
            if type == "printHTML" {
                guard let html = payload["html"] as? String, !html.isEmpty else { return }
                createPrintPDF(from: html)
                return
            }
            if type == "delete-result" {
                let success = payload["success"] as? Bool ?? false
                let message = payload["message"] as? String ?? (success ? "Your MenuMargin account was deleted." : "Account deletion could not finish. Please try again.")
                parent.onDeleteResult(success, message)
                return
            }
            guard type == "state" else { return }

            if lastNativeSelection != .menu, let rawTab = payload["activeView"] as? String, let tab = MenuTab(rawValue: rawTab), tab != .menu {
                parent.selectedTab = tab
                lastNativeSelection = tab
            }
            parent.hasAppAccess = payload["authenticated"] as? Bool ?? false
            parent.needsSubscription = payload["paymentRequired"] as? Bool ?? false
            parent.accountEmail = payload["email"] as? String
            if !parent.hasAppAccess {
                parent.selectedTab = .costing
                lastNativeSelection = .costing
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            if webView === printWebView { return }
            parent.isLoading = true
            parent.loadFailure = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if webView === printWebView {
                renderPendingPDF(in: webView)
                return
            }
            parent.isLoading = false
            parent.loadFailure = nil
            webView.evaluateJavaScript("""
                (() => {
                  const body = document.body;
                  if (!body) return;
                  window.webkit.messageHandlers.menuMargin.postMessage({
                    type: 'state',
                    activeView: body.dataset.activeView || 'costing',
                    authenticated: typeof mmUser !== 'undefined' && Boolean(mmUser),
                    paymentRequired: body.classList.contains('mm-payment-required'),
                    email: typeof mmUser !== 'undefined' ? (mmUser?.email || null) : null
                  });
                })();
                """)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if webView === printWebView {
                failPrintPDF()
                return
            }
            failLoading(with: error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if webView === printWebView {
                failPrintPDF()
                return
            }
            failLoading(with: error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            preferences: WKWebpagePreferences,
            decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
        ) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download, preferences)
                return
            }

            guard let url = navigationAction.request.url else {
                decisionHandler(.allow, preferences)
                return
            }

            if url.scheme == "mailto" || url.scheme == "tel" {
                parent.onOpenExternal(url)
                decisionHandler(.cancel, preferences)
                return
            }

            guard url.scheme == "https", url.host == MenuMarginWebView.trustedHost else {
                parent.onOpenExternal(url)
                decisionHandler(.cancel, preferences)
                return
            }

            decisionHandler(.allow, preferences)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let folder = documents.appendingPathComponent("Downloads", isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let safeName = URL(fileURLWithPath: suggestedFilename).lastPathComponent
                let baseName = safeName.isEmpty ? "MenuMargin export" : safeName
                var destination = folder.appendingPathComponent(baseName)
                if FileManager.default.fileExists(atPath: destination.path) {
                    destination = folder.appendingPathComponent("\(UUID().uuidString)-\(baseName)")
                }
                downloadLocations[ObjectIdentifier(download)] = destination
                completionHandler(destination)
            } catch {
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let url = downloadLocations.removeValue(forKey: ObjectIdentifier(download)) else { return }
            parent.onShare(url)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloadLocations.removeValue(forKey: ObjectIdentifier(download))
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if url.scheme == "https", url.host == MenuMarginWebView.trustedHost {
                webView.load(navigationAction.request)
            } else {
                parent.onOpenExternal(url)
            }
            return nil
        }

        func perform(_ command: MenuCommand, in webView: WKWebView) {
            switch command {
            case .refreshSync:
                webView.evaluateJavaScript("document.getElementById('mmRefreshCloud')?.click();")
            case .manageBilling:
                webView.evaluateJavaScript("document.getElementById('mmManageBillingAccount')?.click();")
            case .exportCSV:
                webView.evaluateJavaScript("document.getElementById('exportCsv')?.click();")
            case .exportBackup:
                webView.evaluateJavaScript("document.getElementById('exportBackup')?.click();")
            case .printPDF:
                webView.evaluateJavaScript("document.getElementById('printBtn')?.click();")
            case .chooseInvoiceFile:
                webView.evaluateJavaScript("document.getElementById('invoiceFile')?.click();")
            case let .importScannedInvoice(data):
                guard data.count <= 30 * 1024 * 1024 else {
                    showMessage("This scanned invoice is larger than 30 MB. Scan fewer pages or choose a smaller PDF.")
                    return
                }
                let base64 = data.base64EncodedString()
                let timestamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
                let filename = "MenuMargin-invoice-\(timestamp).pdf"
                webView.callAsyncJavaScript("""
                    const input = document.getElementById('invoiceFile');
                    if (!input) throw new Error('The invoice scanner is not ready. Open the Scan tab and try again.');
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
                    const file = new File([bytes], fileName, { type: 'application/pdf' });
                    const transfer = new DataTransfer();
                    transfer.items.add(file);
                    input.files = transfer.files;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(resolve => requestAnimationFrame(() => resolve()));
                    const scanButton = document.getElementById('scanInvoice');
                    if (!scanButton) throw new Error('The invoice reader is not available. Please reload MenuMargin and try again.');
                    scanButton.click();
                    return true;
                    """, arguments: ["base64": base64, "fileName": filename], in: nil, in: .page, completionHandler: { [weak self] result in
                        if case let .failure(error) = result {
                            self?.showMessage("Could not send the scanned invoice to MenuMargin. \(error.localizedDescription)")
                        }
                    })
            case .signOut:
                webView.evaluateJavaScript("document.getElementById('mmSignOut')?.click();")
            case let .deleteAccount(email, confirmation):
                guard let emailJSON = jsonString(email), let confirmationJSON = jsonString(confirmation) else {
                    parent.onDeleteResult(false, "The account confirmation could not be prepared. Please try again.")
                    return
                }
                webView.evaluateJavaScript("""
                    (async () => {
                      try {
                        if (typeof mmUser === 'undefined' || !mmUser || typeof mmSupabase === 'undefined') throw new Error('Sign in to your account and try again.');
                        const userId = mmUser.id;
                        const { data, error } = await mmSupabase.functions.invoke('delete-account', {
                          body: { email: \(emailJSON), confirmation: \(confirmationJSON) }
                        });
                        if (error) throw error;
                        if (!data?.deleted) throw new Error(data?.error || 'Account deletion could not finish. Please try again.');
                        try { await mmSupabase.auth.signOut({ scope: 'local' }); } catch (_) {}
                        if (typeof mmRemoveAccountDeviceCopy === 'function') mmRemoveAccountDeviceCopy(userId);
                        mmUser = null;
                        mmEntryPromise = null;
                        mmEntryUserId = null;
                        if (typeof mmClearPrivateUi === 'function') mmClearPrivateUi();
                        window.webkit.messageHandlers.menuMargin.postMessage({ type: 'delete-result', success: true, message: 'Your MenuMargin account and cloud data were deleted.' });
                      } catch (error) {
                        window.webkit.messageHandlers.menuMargin.postMessage({ type: 'delete-result', success: false, message: error?.message || 'Account deletion could not finish. Please try again.' });
                      }
                    })();
                    """)
            }
        }

        private func receiveFile(_ payload: [String: Any]) {
            guard let base64 = payload["base64"] as? String,
                  let data = Data(base64Encoded: base64),
                  !data.isEmpty else {
                showMessage("MenuMargin could not prepare this export. Please try again.")
                return
            }
            let filename = safeFilename(payload["filename"] as? String ?? "MenuMargin export")
            do {
                parent.onShare(try saveFile(data, filename: filename))
            } catch {
                showMessage("MenuMargin could not save this export. \(error.localizedDescription)")
            }
        }

        private func createPrintPDF(from html: String) {
            pendingPrintHTML = true
            let pdfView = WKWebView(frame: CGRect(x: 0, y: 0, width: 612, height: 792))
            pdfView.navigationDelegate = self
            printWebView = pdfView
            pdfView.loadHTMLString(html, baseURL: nil)
        }

        private func renderPendingPDF(in webView: WKWebView) {
            guard webView === printWebView, pendingPrintHTML else { return }
            webView.evaluateJavaScript("Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)") { [weak self, weak webView] result, error in
                guard let self, let webView, error == nil else {
                    self?.showMessage("MenuMargin could not prepare the recipe PDF. Please try again.")
                    self?.printWebView = nil
                    self?.pendingPrintHTML = false
                    return
                }
                let contentHeight = max(792, (result as? NSNumber)?.doubleValue ?? 792)
                let configuration = WKPDFConfiguration()
                configuration.rect = CGRect(x: 0, y: 0, width: 612, height: contentHeight)
                webView.createPDF(configuration: configuration) { [weak self] result in
                    guard let self else { return }
                    defer {
                        self.printWebView = nil
                        self.pendingPrintHTML = false
                    }
                    do {
                        let data = try result.get()
                        self.parent.onShare(try self.saveFile(data, filename: "MenuMargin recipe.pdf"))
                    } catch {
                        self.showMessage("MenuMargin could not create the recipe PDF. \(error.localizedDescription)")
                    }
                }
            }
        }

        private func saveFile(_ data: Data, filename: String) throws -> URL {
            let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            let folder = documents.appendingPathComponent("Downloads", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = folder.appendingPathComponent(filename)
            if FileManager.default.fileExists(atPath: destination.path) {
                let name = destination.deletingPathExtension().lastPathComponent
                let ext = destination.pathExtension
                let uniqueName = "\(name)-\(UUID().uuidString.prefix(8))" + (ext.isEmpty ? "" : ".\(ext)")
                let unique = folder.appendingPathComponent(uniqueName)
                try data.write(to: unique, options: .atomic)
                return unique
            }
            try data.write(to: destination, options: .atomic)
            return destination
        }

        private func safeFilename(_ filename: String) -> String {
            let lastComponent = URL(fileURLWithPath: filename).lastPathComponent
            let cleaned = lastComponent.replacingOccurrences(of: "[\\\\/:*?\"<>|]", with: "-", options: .regularExpression)
            return cleaned.isEmpty ? "MenuMargin export" : cleaned
        }

        private func jsonString(_ value: String) -> String? {
            guard let data = try? JSONSerialization.data(withJSONObject: [value]),
                  let wrapped = String(data: data, encoding: .utf8), wrapped.count >= 2 else { return nil }
            return String(wrapped.dropFirst().dropLast())
        }

        private func showMessage(_ message: String) {
            guard let webView else { return }
            let alert = UIAlertController(title: "MenuMargin", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, from: webView) {}
        }

        private func failPrintPDF() {
            printWebView = nil
            pendingPrintHTML = false
            showMessage("MenuMargin could not prepare the recipe PDF. Please try again.")
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: "MenuMargin", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            present(alert, from: webView, fallback: completionHandler)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: "MenuMargin", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
            present(alert, from: webView) { completionHandler(false) }
        }

        private func failLoading(with error: Error) {
            guard !((error as NSError).code == NSURLErrorCancelled) else { return }
            parent.isLoading = false
            parent.loadFailure = "Check your internet connection, then try again. Your MenuMargin account data remains in this app’s stored website data."
        }

        private func present(_ controller: UIViewController, from webView: WKWebView, fallback: () -> Void) {
            guard let root = webView.window?.rootViewController else {
                fallback()
                return
            }
            topViewController(from: root).present(controller, animated: true)
        }

        private func topViewController(from controller: UIViewController) -> UIViewController {
            if let presented = controller.presentedViewController {
                return topViewController(from: presented)
            }
            if let navigation = controller as? UINavigationController, let visible = navigation.visibleViewController {
                return topViewController(from: visible)
            }
            if let tab = controller as? UITabBarController, let selected = tab.selectedViewController {
                return topViewController(from: selected)
            }
            return controller
        }
    }
}

private struct InvoiceDocumentScanner: UIViewControllerRepresentable {
    let onComplete: (Data) -> Void
    let onCancel: () -> Void
    let onFailure: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: VNDocumentCameraViewController, context: Context) {
        context.coordinator.parent = self
    }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        var parent: InvoiceDocumentScanner

        init(parent: InvoiceDocumentScanner) {
            self.parent = parent
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onCancel()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
            parent.onFailure(error.localizedDescription)
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            do {
                guard scan.pageCount > 0 else { throw ScanExportError.noPages }
                let pageRect = CGRect(x: 0, y: 0, width: 595, height: 842)
                let renderer = UIGraphicsPDFRenderer(bounds: pageRect)
                let data = renderer.pdfData { pdf in
                    for index in 0..<scan.pageCount {
                        pdf.beginPage()
                        let sourceImage = scan.imageOfPage(at: index)
                        let compressedImage: UIImage
                        if let jpeg = sourceImage.jpegData(compressionQuality: 0.84), let decoded = UIImage(data: jpeg) {
                            compressedImage = decoded
                        } else {
                            compressedImage = sourceImage
                        }
                        let margin: CGFloat = 20
                        let available = pageRect.insetBy(dx: margin, dy: margin)
                        let scale = min(available.width / compressedImage.size.width, available.height / compressedImage.size.height)
                        let fittedSize = CGSize(width: compressedImage.size.width * scale, height: compressedImage.size.height * scale)
                        let imageRect = CGRect(
                            x: pageRect.midX - fittedSize.width / 2,
                            y: pageRect.midY - fittedSize.height / 2,
                            width: fittedSize.width,
                            height: fittedSize.height
                        )
                        compressedImage.draw(in: imageRect)
                    }
                }
                guard data.count <= 30 * 1024 * 1024 else { throw ScanExportError.tooLarge }
                parent.onComplete(data)
            } catch {
                parent.onFailure(error.localizedDescription)
            }
        }
    }

    private enum ScanExportError: LocalizedError {
        case noPages
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .noPages: "No invoice pages were captured. Scan the invoice again."
            case .tooLarge: "This invoice is larger than 30 MB. Scan fewer pages or choose a smaller PDF."
            }
        }
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

private struct SafariPage: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

private extension Color {
    static let menuMarginGreen = Color(red: 21 / 255, green: 62 / 255, blue: 53 / 255)
}
