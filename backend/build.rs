use std::path::Path;

fn main() {
    // The phone camera page (pumpCourt/phone.html) is built into one HTML file
    // by `npm run build` in frontend/ and baked into the app here. Before the
    // first frontend build, a placeholder that says so is used instead.
    let built = Path::new("../frontend/dist/phone.html");
    println!("cargo:rerun-if-changed={}", built.display());
    let page = std::fs::read_to_string(built).unwrap_or_else(|_| {
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\">\
         <title>Pump-Court phone camera</title><p>The phone page isn't built yet. On the laptop, run \
         <code>npm run build</code> in the frontend folder, then rebuild the app.</p></html>"
            .to_string()
    });
    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("phone.html");
    std::fs::write(out, page).unwrap();

    tauri_build::build()
}
