fn main() {
    println!("cargo:rerun-if-changed=web");
    println!("cargo:rerun-if-changed=public");
    println!("cargo:rerun-if-changed=Cargo.toml");
}
