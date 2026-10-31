import ExpoModulesCore
import UIKit

/**
 * iOS bridge for JOSH / DothanTech LPAPI.
 * Mirrors the Android JoshPrinter module method names so JS stays shared.
 * Calls LPAPI only through JoshLPAPIClient (no Swift bridging header).
 */
public class JoshPrinterModule: Module {
  private var connectedName: String?
  private var connectedId: String?
  private var discovering = false
  private var printing = false
  private var lastError: String?
  private var density = 6
  private var speed = 3
  private var gapType = 2
  private var gapLengthMm = 3.0
  private var lastConnectedAt: Double = 0

  public func definition() -> ModuleDefinition {
    Name("JoshPrinter")

    Events(
      "onJoshPrinterDiscovered",
      "onJoshScanFinished",
      "onJoshConnectionStateChanged",
      "onJoshPrintProgress",
      "onJoshError"
    )

    OnCreate {
      JoshLPAPIClient.setStateHandler { [weak self] code, message in
        guard let self else { return }
        let msg = message ?? ""
        if code != 0 {
          self.lastError = msg.isEmpty ? "Printer state \(code)" : msg
          self.sendEvent("onJoshError", [
            "code": "STATE_\(code)",
            "message": self.lastError as Any,
          ])
        }
        let stillConnected = !(msg.localizedCaseInsensitiveContains("disconnect")
          || msg.localizedCaseInsensitiveContains("断开"))
        if !stillConnected {
          self.connectedName = nil
          self.connectedId = nil
        }
        self.emitConnectionState(stillConnected ? "CONNECTED" : "DISCONNECTED")
      }
    }

    Function("isAvailable") { () -> Bool in
      true
    }

    Function("isBluetoothEnabled") { () -> Bool in
      // LPAPI owns CoreBluetooth; report optimistic true so the JS scan path can start.
      true
    }

    Function("isDeviceNameSupported") { (name: String?) -> Bool in
      guard let name, !name.isEmpty else { return false }
      let upper = name.uppercased()
      return upper.contains("JOSH")
        || upper.contains("SEZNIK")
        || upper.contains("D110")
        || upper.contains("B21")
        || upper.contains("B1")
        || upper.contains("NIIMBOT")
    }

    AsyncFunction("getBondedDevices") { () -> [[String: Any]] in
      []
    }

    AsyncFunction("pairDevice") { (_ mac: String, _ timeoutMs: Int) -> Bool in
      false
    }

    AsyncFunction("startDiscovery") { () -> [String: Any] in
      if self.discovering {
        return ["discoveryStarted": false]
      }
      self.discovering = true
      self.emitConnectionState("DISCOVERING")

      return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<[String: Any], Error>) in
        JoshLPAPIClient.scanPrinters(
          completion: { [weak self] names in
            guard let self else {
              cont.resume(returning: ["discoveryStarted": true])
              return
            }
            for name in names {
              self.sendEvent("onJoshPrinterDiscovered", [
                "id": name,
                "name": name,
                "macAddress": name,
                "transport": "josh-lpapi",
                "sdkId": "josh",
                "bonded": false,
              ])
            }
            self.discovering = false
            self.sendEvent("onJoshScanFinished", [:] as [String: Any])
            self.emitConnectionState(self.connectedName != nil ? "CONNECTED" : "IDLE")
            cont.resume(returning: ["discoveryStarted": true])
          },
          didOpenPrinterHandler: { [weak self] success in
            guard let self, success else { return }
            let name = JoshLPAPIClient.connectingPrinterName() ?? self.connectedName ?? ""
            self.connectedName = name
            self.connectedId = name
            self.lastConnectedAt = Date().timeIntervalSince1970 * 1000
            self.emitConnectionState("CONNECTED")
          }
        )
      }
    }

    AsyncFunction("stopDiscovery") { () in
      self.discovering = false
      self.sendEvent("onJoshScanFinished", [:] as [String: Any])
    }

    AsyncFunction("readPrinterGapReport") { () -> [String: Any] in
      [
        "available": self.connectedName != nil,
        "gapType": self.gapType,
        "gapLength": self.gapLengthMm,
        "supportedGapTypes": [0, 1, 2, 3],
        "line": "printer gapType=\(self.gapType) gapLength=\(self.gapLengthMm) supportedGapTypes=0,1,2,3",
      ]
    }

    AsyncFunction("readPrinterStatus") { (_ timeoutMs: Int) -> [String: Any] in
      [
        "available": self.connectedName != nil,
        "busy": self.printing,
        "gapType": self.gapType,
        "supportedGapTypes": [0, 1, 2, 3],
      ]
    }

    AsyncFunction("getBatteryLevel") { () -> Int in
      -1
    }

    AsyncFunction("debugLogBattery") { () in
      // no-op on iOS
    }

    AsyncFunction("connect") { (macAddress: String, name: String?) -> [String: Any] in
      let printerName = (name?.isEmpty == false ? name! : macAddress)
      return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<[String: Any], Error>) in
        JoshLPAPIClient.openPrinter(printerName) { [weak self] success in
          guard let self else {
            cont.resume(throwing: NSError(domain: "JoshPrinter", code: -1, userInfo: [
              NSLocalizedDescriptionKey: "Module released during connect",
            ]))
            return
          }
          if success {
            let resolvedName = JoshLPAPIClient.connectingDeviceName()
              ?? JoshLPAPIClient.connectingPrinterName()
              ?? printerName
            let mcu = JoshLPAPIClient.connectingMcuId()
            let address = JoshLPAPIClient.connectingDeviceAddress()
            let stableId: String
            if let mcu, !mcu.isEmpty {
              stableId = mcu
            } else if let address, !address.isEmpty {
              stableId = address
            } else {
              stableId = resolvedName
            }
            self.connectedName = resolvedName
            self.connectedId = stableId
            self.lastError = nil
            self.lastConnectedAt = Date().timeIntervalSince1970 * 1000
            self.applyPrintParams()
            self.emitConnectionState("CONNECTED")
            cont.resume(returning: [
              "id": stableId,
              "name": resolvedName,
              "macAddress": address ?? stableId,
              "transport": "josh-lpapi",
              "sdkId": "josh",
            ])
          } else {
            let err = "Failed to connect to JOSH printer"
            self.lastError = err
            self.emitConnectionState("DISCONNECTED")
            cont.resume(throwing: NSError(domain: "JoshPrinter", code: 1, userInfo: [
              NSLocalizedDescriptionKey: err,
            ]))
          }
        }
      }
    }

    AsyncFunction("disconnect") { () in
      JoshLPAPIClient.closePrinter()
      self.connectedName = nil
      self.connectedId = nil
      self.emitConnectionState("DISCONNECTED")
    }

    AsyncFunction("reconnect") { () -> Bool in
      guard let name = self.connectedName, !name.isEmpty else { return false }
      return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Bool, Error>) in
        JoshLPAPIClient.openPrinter(name) { [weak self] success in
          guard let self else {
            cont.resume(returning: false)
            return
          }
          if success {
            self.lastConnectedAt = Date().timeIntervalSince1970 * 1000
            self.emitConnectionState("CONNECTED")
          }
          cont.resume(returning: success)
        }
      }
    }

    Function("getState") { () -> [String: Any] in
      self.stateSnapshot()
    }

    Function("isConnected") { () -> Bool in
      self.connectedName != nil
    }

    AsyncFunction("configureParams") { (params: [String: Any]) in
      if let density = params["density"] as? NSNumber, density.intValue >= 0 {
        self.density = density.intValue
      }
      if let speed = params["speed"] as? NSNumber, speed.intValue >= 0 {
        self.speed = speed.intValue
      }
      if let gapType = params["gapType"] as? NSNumber {
        self.gapType = gapType.intValue
      }
      if let gapLength = params["gapLength"] as? NSNumber {
        self.gapLengthMm = gapLength.doubleValue
      }
      self.applyPrintParams()
    }

    AsyncFunction("printPngLabel") { (options: [String: Any]) -> [String: Any] in
      guard self.connectedName != nil else {
        throw NSError(domain: "JoshPrinter", code: 2, userInfo: [
          NSLocalizedDescriptionKey: "JOSH printer is not connected",
        ])
      }
      guard let pngBase64 = options["pngBase64"] as? String, !pngBase64.isEmpty else {
        throw NSError(domain: "JoshPrinter", code: 3, userInfo: [
          NSLocalizedDescriptionKey: "Missing pngBase64 parameter",
        ])
      }

      let widthMm = (options["widthMm"] as? NSNumber)?.doubleValue ?? 40
      let heightMm = (options["heightMm"] as? NSNumber)?.doubleValue ?? 30
      let copies = max(1, (options["copies"] as? NSNumber)?.intValue ?? 1)
      let density = (options["density"] as? NSNumber)?.intValue ?? -1
      let speed = (options["speed"] as? NSNumber)?.intValue ?? -1
      let gapType = (options["gapType"] as? NSNumber)?.intValue ?? self.gapType
      let gapLengthMm = (options["gapLength"] as? NSNumber)?.doubleValue ?? self.gapLengthMm

      if density >= 0 { self.density = density }
      if speed >= 0 { self.speed = speed }
      self.gapType = gapType
      self.gapLengthMm = gapLengthMm
      self.applyPrintParams()

      guard let raw = Data(base64Encoded: pngBase64, options: [.ignoreUnknownCharacters]),
            let image = UIImage(data: raw) else {
        throw NSError(domain: "JoshPrinter", code: 4, userInfo: [
          NSLocalizedDescriptionKey: "Failed to decode PNG for print",
        ])
      }

      let jobId = "josh-ios-\(Int(Date().timeIntervalSince1970 * 1000))"
      let started = Date()
      self.printing = true
      self.sendEvent("onJoshPrintProgress", [
        "jobId": jobId,
        "progress": "START_COPY",
        "copy": 1,
        "copies": copies,
      ])

      var lastSuccess = false
      for copyIndex in 1...copies {
        let ok = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Bool, Error>) in
          JoshLPAPIClient.printImage(image) { success in
            cont.resume(returning: success)
          }
        }
        lastSuccess = ok
        if !ok { break }
        self.sendEvent("onJoshPrintProgress", [
          "jobId": jobId,
          "progress": "SUCCESS",
          "copy": copyIndex,
          "copies": copies,
        ])
      }

      self.printing = false
      let totalMs = Int(Date().timeIntervalSince(started) * 1000)
      if !lastSuccess {
        self.lastError = "Print failed"
        self.sendEvent("onJoshPrintProgress", [
          "jobId": jobId,
          "progress": "FAILED",
          "copies": copies,
        ])
        throw NSError(domain: "JoshPrinter", code: 5, userInfo: [
          NSLocalizedDescriptionKey: "Print failed",
        ])
      }

      return [
        "jobId": jobId,
        "copies": copies,
        "widthMm": widthMm,
        "heightMm": heightMm,
        "targetW": Int(image.size.width.rounded()),
        "targetH": Int(image.size.height.rounded()),
        "density": self.density,
        "speed": self.speed,
        "decodeMs": 0,
        "fitMs": 0,
        "submitMs": totalMs,
        "waitMs": 0,
        "totalMs": totalMs,
        "confirmedByDevice": true,
      ]
    }
  }

  private func applyPrintParams() {
    JoshLPAPIClient.setGapType(
      Int32(gapType),
      gapLengthMm: Int32(max(0, Int(gapLengthMm.rounded()))),
      darkness: Int32(max(0, min(15, density))),
      speed: Int32(max(0, min(5, speed)))
    )
  }

  private func stateSnapshot() -> [String: Any] {
    [
      "state": connectedName != nil ? "CONNECTED" : (discovering ? "DISCOVERING" : "IDLE"),
      "isConnected": connectedName != nil,
      "isPrinting": printing,
      "isDiscovering": discovering,
      "printerName": connectedName as Any,
      "macAddress": connectedId as Any,
      "lastError": lastError as Any,
      "lastConnectedAt": lastConnectedAt,
      "density": density,
      "speed": speed,
      "gapType": gapType,
      "gapLength": gapLengthMm,
    ]
  }

  private func emitConnectionState(_ state: String) {
    var payload = stateSnapshot()
    payload["state"] = state
    sendEvent("onJoshConnectionStateChanged", payload)
  }
}
