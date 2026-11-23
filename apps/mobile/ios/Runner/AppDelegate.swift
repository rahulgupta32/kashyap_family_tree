import AVKit
import Flutter
import firebase_messaging
import UIKit
import UniformTypeIdentifiers

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var pickingReel = false
  private var reelPlayer: AVPlayerViewController?
  private var reelFile: URL?
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
      guard let self else {
        result(FlutterError(code: "PICKER", message: "Attachment picker unavailable", details: nil))
        return
      }
      switch call.method {
      case "pickProfile", "pickReel":
        self.pickEvidence(result, reel: call.method == "pickReel")
      case "playReel":
        self.playReel(call.arguments as? FlutterStandardTypedData, result: result)
      case "stopReel":
        self.reelPlayer?.dismiss(animated: true)
        self.clearReel()
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  private func presenter() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive && $0.keyWindow != nil }?.keyWindow
    guard var top = window?.rootViewController else { return nil }
    while let shown = top.presentedViewController { top = shown }
    return top
  }

  private func playReel(_ bytes: FlutterStandardTypedData?, result: FlutterResult) {
    guard let bytes, !bytes.data.isEmpty, bytes.data.count <= 20 * 1024 * 1024,
          reelPlayer == nil, let presenter = presenter() else {
      result(FlutterError(code: "VIDEO", message: "Cannot open reel", details: nil))
      return
    }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("reel-\(UUID()).mp4")
    do {
      try bytes.data.write(to: url, options: [.atomic, .completeFileProtection])
      let player = AVPlayerViewController()
      player.player = AVPlayer(url: url)
      player.player?.isMuted = true
      player.allowsPictureInPicturePlayback = false
      player.modalPresentationStyle = .pageSheet
      player.presentationController?.delegate = self
      reelPlayer = player
      reelFile = url
      presenter.present(player, animated: true) { player.player?.play() }
      result(nil)
    } catch {
      try? FileManager.default.removeItem(at: url)
      result(FlutterError(code: "VIDEO", message: "Cannot open reel", details: nil))
    }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    if presentationController.presentedViewController === reelPlayer { clearReel() }
  }

  private func clearReel() {
    reelPlayer?.player?.pause()
    reelPlayer?.player = nil
    reelPlayer = nil
    if let reelFile { try? FileManager.default.removeItem(at: reelFile) }
    reelFile = nil
  }

  private func pickEvidence(_ result: @escaping FlutterResult, reel: Bool) {
    guard evidenceResult == nil else {
      result(FlutterError(code: "BUSY", message: "Attachment picker already open", details: nil))
      return
    }
    guard let presenter = presenter() else {
      result(FlutterError(code: "PICKER", message: "Attachment picker unavailable", details: nil))
      return
    }
    pickingReel = reel
    let types: [UTType] = reel ? [.mpeg4Movie] : Self.evidenceTypes
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: !reel)
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
    let reel = pickingReel
    DispatchQueue.global(qos: .userInitiated).async {
      let payload = Self.readEvidence(url, reel: reel)
      DispatchQueue.main.async { self.finishEvidence(payload) }
    }
  }

  private static func readEvidence(_ url: URL, reel: Bool) -> Any {
    let limit = (reel ? 20 : 10) * 1024 * 1024
    let allowed = reel ? ["video/mp4"] : evidenceTypes.compactMap { $0.preferredMIMEType }
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
            return FlutterError(code: "FILE", message: "Attachment exceeds the size limit", details: nil)
          }
        }
        if !data.isEmpty {
          if reel { return FlutterStandardTypedData(bytes: data) }
          return ["mimeType": mime, "dataBase64": data.base64EncodedString()]
        }
      }
    } catch {
      return FlutterError(code: "FILE", message: "Attachment unavailable", details: nil)
    }
    return FlutterError(code: "FILE", message: reel ? "Choose an MP4 up to 20 MiB" : "Choose a JPEG, PNG or WebP up to 10 MB", details: nil)
  }

  private func finishEvidence(_ value: Any?) {
    let result = evidenceResult
    evidenceResult = nil
    result?(value)
  }
}
