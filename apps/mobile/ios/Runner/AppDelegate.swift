import Flutter
import firebase_messaging
import UIKit
import UniformTypeIdentifiers

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, UIDocumentPickerDelegate {
  private var evidenceResult: FlutterResult?
  private static let evidenceTypes: [UTType] = [.jpeg, .png, .webP]
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FLTFirebaseMessagingPlugin.configureNotificationCenterDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "kashyap/chat_attachments", binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "pickProfile" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let self else {
        result(FlutterError(code: "PICKER", message: "Attachment picker unavailable", details: nil))
        return
      }
      self.pickEvidence(result)
    }
  }

  private func pickEvidence(_ result: @escaping FlutterResult) {
    guard evidenceResult == nil else {
      result(FlutterError(code: "BUSY", message: "Attachment picker already open", details: nil))
      return
    }
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive && $0.keyWindow != nil }?.keyWindow
    guard let root = window?.rootViewController else {
      result(FlutterError(code: "PICKER", message: "Attachment picker unavailable", details: nil))
      return
    }
    var presenter = root
    while let presented = presenter.presentedViewController { presenter = presented }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: Self.evidenceTypes, asCopy: true)
    picker.allowsMultipleSelection = false
    picker.delegate = self
    evidenceResult = result
    presenter.present(picker, animated: true)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishEvidence(nil)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      finishEvidence(nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      let payload = Self.readEvidence(url)
      DispatchQueue.main.async { self.finishEvidence(payload) }
    }
  }

  private static func readEvidence(_ url: URL) -> Any {
    let limit = 10 * 1024 * 1024
    let allowed = evidenceTypes.compactMap { $0.preferredMIMEType }
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    do {
      let values = try url.resourceValues(forKeys: [.contentTypeKey, .isRegularFileKey])
      if values.isRegularFile == true,
         let mime = values.contentType?.preferredMIMEType, allowed.contains(mime) {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var data = Data()
        while let chunk = try file.read(upToCount: min(8192, limit + 1 - data.count)), !chunk.isEmpty {
          data.append(chunk)
          if data.count > limit {
            return FlutterError(code: "FILE", message: "Attachment exceeds 10 MB", details: nil)
          }
        }
        if !data.isEmpty {
          return ["mimeType": mime, "dataBase64": data.base64EncodedString()]
        }
      }
    } catch {
      return FlutterError(code: "FILE", message: "Attachment unavailable", details: nil)
    }
    return FlutterError(code: "FILE", message: "Choose a JPEG, PNG or WebP up to 10 MB", details: nil)
  }

  private func finishEvidence(_ value: Any?) {
    let result = evidenceResult
    evidenceResult = nil
    result?(value)
  }
}
