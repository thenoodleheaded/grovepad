use std::{env, path::PathBuf, process::Command};

const COMMANDS: &[&str] = &[];

fn xcrun_output(arguments: &[&str], purpose: &str) -> PathBuf {
    let output = Command::new("xcrun")
        .args(arguments)
        .output()
        .unwrap_or_else(|_| panic!("{purpose}"));
    assert!(output.status.success(), "{purpose}");
    PathBuf::from(
        String::from_utf8(output.stdout)
            .expect("xcrun returned a non-UTF-8 path")
            .trim(),
    )
}

fn build_macos_bridge() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" {
        return;
    }

    let arch = env::var("CARGO_CFG_TARGET_ARCH").expect("target arch");
    let swift_arch = match arch.as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => panic!("unsupported macOS architecture for WidgetKit bridge: {other}"),
    };
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR"));
    let object = output.join("GrovepadWidgetBridge.o");
    let library = output.join("libgrovepad_widget_bridge.a");
    let source = PathBuf::from("apple/GrovepadWidgetBridge.swift");

    let status = Command::new("xcrun")
        .args([
            "--sdk",
            "macosx",
            "swiftc",
            "-parse-as-library",
            "-O",
            "-whole-module-optimization",
            "-target",
            &format!("{swift_arch}-apple-macosx11.0"),
            "-emit-object",
        ])
        .arg(&source)
        .arg("-o")
        .arg(&object)
        .status()
        .expect("run Swift compiler for macOS widget bridge");
    assert!(status.success(), "Swift widget bridge compilation failed");

    let status = Command::new("xcrun")
        .args(["ar", "crs"])
        .arg(&library)
        .arg(&object)
        .status()
        .expect("archive macOS widget bridge");
    assert!(status.success(), "Swift widget bridge archive failed");

    println!("cargo:rerun-if-changed={}", source.display());
    let swiftc = xcrun_output(&["--find", "swiftc"], "locate the Xcode Swift compiler");
    let swift_libraries = swiftc
        .parent()
        .and_then(|bin| bin.parent())
        .expect("Swift compiler is not inside an Xcode toolchain")
        .join("lib/swift/macosx");
    let sdk_libraries = xcrun_output(
        &["--sdk", "macosx", "--show-sdk-path"],
        "locate the macOS SDK",
    )
    .join("usr/lib/swift");
    println!("cargo:rustc-link-search=native={}", output.display());
    println!(
        "cargo:rustc-link-search=native={}",
        swift_libraries.display()
    );
    println!("cargo:rustc-link-search=native={}", sdk_libraries.display());
    println!("cargo:rustc-link-lib=static=grovepad_widget_bridge");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=WidgetKit");
}

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
    build_macos_bridge();
}
