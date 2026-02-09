use std::fs;
use std::path::PathBuf;
use std::io::{Read, Write};
use log::{info, error, warn};
use chrono::Local;
use zip::write::FileOptions;
use serde::{Serialize, Deserialize};
use tauri::{Manager, AppHandle};

#[tauri::command]
fn save_data(app: AppHandle, key: String, data: String) -> Result<(), String> {
    info!("Saving data for key: {}", key);

    let app_dir = get_app_dir(&app)?;
    let file_path = app_dir.join(format!("{}.json", key));

    match fs::write(&file_path, &data) {
        Ok(_) => {
            info!("Successfully saved data for key: {} ({} bytes)", key, data.len());
            Ok(())
        },
        Err(e) => {
            error!("Failed to save data for key {}: {}", key, e);
            Err(format!("Failed to save data: {}", e))
        }
    }
}

#[tauri::command]
fn load_data(app: AppHandle, key: String) -> Result<String, String> {
    info!("Loading data for key: {}", key);

    let app_dir = get_app_dir(&app)?;
    let file_path = app_dir.join(format!("{}.json", key));

    if !file_path.exists() {
        warn!("File does not exist for key: {}, returning empty array", key);
        return Ok(String::from("[]"));
    }

    match fs::read_to_string(&file_path) {
        Ok(data) => {
            info!("Successfully loaded data for key: {} ({} bytes)", key, data.len());
            Ok(data)
        },
        Err(e) => {
            error!("Failed to load data for key {}: {}", key, e);
            Err(format!("Failed to load data: {}", e))
        }
    }
}

fn get_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("data");

    info!("Using app data directory: {:?}", app_dir);

    match fs::create_dir_all(&app_dir) {
        Ok(_) => {
            info!("Data directory ready: {:?}", app_dir);
            Ok(app_dir)
        },
        Err(e) => {
            error!("Failed to create data directory {:?}: {}", app_dir, e);
            Err(format!("Failed to create data directory: {}", e))
        }
    }
}

fn get_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let backup_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("backups");

    info!("Using backup directory: {:?}", backup_dir);

    match fs::create_dir_all(&backup_dir) {
        Ok(_) => {
            info!("Backup directory ready: {:?}", backup_dir);
            Ok(backup_dir)
        },
        Err(e) => {
            error!("Failed to create backup directory {:?}: {}", backup_dir, e);
            Err(format!("Failed to create backup directory: {}", e))
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct BackupInfo {
    filename: String,
    size: u64,
    created_at: String,
}

#[tauri::command]
fn create_backup(app: AppHandle) -> Result<BackupInfo, String> {
    info!("Creating backup...");

    let data_dir = get_app_dir(&app)?;
    let backup_dir = get_backup_dir(&app)?;

    // 백업 파일명: backup_YYYYMMDD_HHMMSS.zip
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_filename = format!("backup_{}.zip", timestamp);
    let backup_path = backup_dir.join(&backup_filename);

    info!("Creating backup file: {:?}", backup_path);

    // ZIP 파일 생성
    let file = fs::File::create(&backup_path)
        .map_err(|e| format!("Failed to create backup file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    // data 디렉토리의 모든 파일을 ZIP에 추가
    if data_dir.exists() {
        for entry in fs::read_dir(&data_dir)
            .map_err(|e| format!("Failed to read data directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_file() {
                let filename = path.file_name()
                    .ok_or("Failed to get filename")?
                    .to_str()
                    .ok_or("Failed to convert filename to string")?;

                info!("Adding file to backup: {}", filename);

                zip.start_file(filename, options)
                    .map_err(|e| format!("Failed to start file in zip: {}", e))?;

                let mut file_content = Vec::new();
                fs::File::open(&path)
                    .and_then(|mut f| f.read_to_end(&mut file_content))
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                zip.write_all(&file_content)
                    .map_err(|e| format!("Failed to write to zip: {}", e))?;
            }
        }
    }

    zip.finish().map_err(|e| format!("Failed to finish zip: {}", e))?;

    // 백업 정보 반환
    let metadata = fs::metadata(&backup_path)
        .map_err(|e| format!("Failed to read backup metadata: {}", e))?;

    let backup_info = BackupInfo {
        filename: backup_filename,
        size: metadata.len(),
        created_at: Local::now().to_rfc3339(),
    };

    info!("Backup created successfully: {:?}", backup_info);
    Ok(backup_info)
}

#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    info!("Listing backups...");

    let backup_dir = get_backup_dir(&app)?;
    let mut backups = Vec::new();

    if backup_dir.exists() {
        for entry in fs::read_dir(&backup_dir)
            .map_err(|e| format!("Failed to read backup directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("zip") {
                let filename = path.file_name()
                    .ok_or("Failed to get filename")?
                    .to_str()
                    .ok_or("Failed to convert filename to string")?
                    .to_string();

                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let created_at = metadata.modified()
                    .map_err(|e| format!("Failed to get file modified time: {}", e))?;

                backups.push(BackupInfo {
                    filename,
                    size: metadata.len(),
                    created_at: chrono::DateTime::<Local>::from(created_at).to_rfc3339(),
                });
            }
        }
    }

    // 최신순으로 정렬
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    info!("Found {} backups", backups.len());
    Ok(backups)
}

#[tauri::command]
fn restore_backup(app: AppHandle, filename: String) -> Result<(), String> {
    info!("Restoring backup: {}", filename);

    let backup_dir = get_backup_dir(&app)?;
    let data_dir = get_app_dir(&app)?;
    let backup_path = backup_dir.join(&filename);

    if !backup_path.exists() {
        error!("Backup file not found: {:?}", backup_path);
        return Err(format!("Backup file not found: {}", filename));
    }

    // 기존 데이터 백업 (안전을 위해)
    let temp_backup = create_backup(app.clone())?;
    info!("Created safety backup: {}", temp_backup.filename);

    // ZIP 파일 열기
    let file = fs::File::open(&backup_path)
        .map_err(|e| format!("Failed to open backup file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // 기존 데이터 파일 삭제
    if data_dir.exists() {
        for entry in fs::read_dir(&data_dir)
            .map_err(|e| format!("Failed to read data directory: {}", e))? {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            if path.is_file() {
                fs::remove_file(&path)
                    .map_err(|e| format!("Failed to remove old file: {}", e))?;
            }
        }
    }

    // ZIP에서 파일 추출
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read file from zip: {}", e))?;
        let filename = file.name().to_string();
        let outpath = data_dir.join(&filename);

        info!("Extracting: {}", filename);

        let mut outfile = fs::File::create(&outpath)
            .map_err(|e| format!("Failed to create file: {}", e))?;
        let mut content = Vec::new();
        file.read_to_end(&mut content)
            .map_err(|e| format!("Failed to read file content: {}", e))?;
        outfile.write_all(&content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
    }

    info!("Backup restored successfully from: {}", filename);
    Ok(())
}

#[tauri::command]
fn delete_backup(app: AppHandle, filename: String) -> Result<(), String> {
    info!("Deleting backup: {}", filename);

    let backup_dir = get_backup_dir(&app)?;
    let backup_path = backup_dir.join(&filename);

    if !backup_path.exists() {
        error!("Backup file not found: {:?}", backup_path);
        return Err(format!("Backup file not found: {}", filename));
    }

    fs::remove_file(&backup_path)
        .map_err(|e| format!("Failed to delete backup file: {}", e))?;

    info!("Backup deleted successfully: {}", filename);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      // 로깅 시스템 설정 (개발/프로덕션 모두)
      let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
      } else {
        log::LevelFilter::Info
      };

      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log_level)
          .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
          ))
          .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::LogDir { file_name: Some("app.log".into()) },
          ))
          .max_file_size(50_000) // 50KB per log file
          .build(),
      )?;

      info!("Application started");
      info!("Log level: {:?}", log_level);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      save_data,
      load_data,
      create_backup,
      list_backups,
      restore_backup,
      delete_backup
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
