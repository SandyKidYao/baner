import Foundation
import CoreGraphics
// usage: winwait <app path> <owner name> ; prints ms from `open` to first on-screen layer-0 window of owner
let args = CommandLine.arguments
let app = args[1], owner = args[2]
let t0 = DispatchTime.now()
let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/open"); p.arguments = ["-a", app]
try! p.run()
while true {
  let elapsed = Double(DispatchTime.now().uptimeNanoseconds - t0.uptimeNanoseconds) / 1e6
  if elapsed > 15000 { print("TIMEOUT"); exit(1) }
  if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] {
    for w in list where (w[kCGWindowOwnerName as String] as? String) == owner && (w[kCGWindowLayer as String] as? Int) == 0 {
      if let b = w[kCGWindowBounds as String] as? [String: Any], let h = b["Height"] as? Double, h > 100 {
        print(String(format: "%.0f", elapsed)); exit(0)
      }
    }
  }
  usleep(2000)
}
