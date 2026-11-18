#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

fn copy_seed(source_root: &Path, data_dir: &Path, source_relative: &str, target_relative: &str) {
    let source = source_root.join(source_relative);
    let target = data_dir.join(target_relative);
    if source.exists() && !target.exists() {
        if let Some(parent) = target.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::copy(source, target);
    }
}

fn free_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(3002)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let sidecar = Arc::new(Mutex::new(None));
    let sidecar_for_exit = sidecar.clone();

    let app = tauri::Builder::default()
        .setup(move |app| {
            let resource = app.path().resource_dir()?;
            let base_data_dir = app.path().app_local_data_dir()?;
            let data_dir = base_data_dir.join("data");
            fs::create_dir_all(&data_dir)?;
            let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."));
            let source_root = if resource.join("data/tierlist.db").exists() {
                resource.clone()
            } else {
                project_root.clone()
            };

            // 首次启动：安装资源 → 可写数据目录
            copy_seed(&source_root, &data_dir, "data/tierlist.db", "tierlist.db");
            copy_seed(&source_root, &data_dir, "data/blacklist.json", "blacklist.json");
            copy_seed(&source_root, &data_dir, "data/player-flags.json", "player-flags.json");
            copy_seed(&source_root, &data_dir, "英雄介绍.json", "英雄介绍.json");

            let root = if resource.join("apps/web/dist/index.html").exists() {
                resource.clone()
            } else {
                project_root.clone()
            };
            let server = if resource.join("server/sg-tierlist-server.exe").exists() {
                resource.join("server/sg-tierlist-server.exe")
            } else {
                project_root.join("server-rs/target/release/sg-tierlist-server.exe")
            };

            let port = free_port();
            let mut child = Command::new(&server)
                .env("SG_RESOURCE_DIR", &root)
                .env("SG_DATA_DIR", &data_dir)
                .env("PORT", port.to_string())
                .current_dir(&root)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;

            let mut ready = false;
            for _ in 0..120 {
                if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                    ready = true;
                    break;
                }
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
            if !ready {
                let _ = child.kill();
                return Err("Rust sidecar 未能启动".into());
            }
            *sidecar.lock().unwrap() = Some(child);

            let url = format!("http://127.0.0.1:{port}/app/").parse()?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("曙光英雄梯度")
                .inner_size(1440.0, 960.0)
                .min_inner_size(1024.0, 700.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())?;

    app.run(move |_app, event| {
        if matches!(event, RunEvent::Exit) {
            if let Some(mut child) = sidecar_for_exit.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
    Ok(())
}
