fn main() {
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
    cc::Build::new()
      .cpp(true)
      .file("ios/SpeechBridge.mm")
      .flag("-fobjc-arc")
      .compile("hologrip_native_speech");
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=Speech");
    println!("cargo:rerun-if-changed=ios/SpeechBridge.mm");
  }
  tauri_build::build()
}
