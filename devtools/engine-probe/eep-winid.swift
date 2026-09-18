// eep-winid.swift - dev only (copied from cultural_diffusion devtools/harness/cdh-winid.swift). Prints "<windowId> <width> <height>" for the game's large layer-0 windows, so a
// screenshot can grab the game even when another window is in front: screencapture -x -o -l <windowId> out.png
// Run: swift devtools/engine-probe/eep-winid.swift
import CoreGraphics
let list = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  if owner.contains("ivilization") {
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let wd = b["Width"] as? Double ?? 0
    let ht = b["Height"] as? Double ?? 0
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    // ht > 600 skips the app's full-width menu-bar strip. The print and the closing brace used to sit INSIDE
    // this trailing comment, so the file never compiled and every window-targeted screenshot silently fell
    // back to a frontmost-app capture.
    if wd > 400 && ht > 600 && layer == 0 {
      print(w[kCGWindowNumber as String] as? Int ?? 0, Int(wd), Int(ht))
    }
  }
}
