use crate::account_files::{
    collect_account_files,
    files_have_same_content,
    paths_match,
    ParsedAccountFile,
    resolve_available_account_target,
    resolve_managed_account_path,
};
use crate::config::{load_config, save_config};
use crate::error::{AppError, AppResult};
use crate::{
    extract_info_from_auth,
    get_accounts_dir,
    get_codex_auth_file,
    gateway_platform_key_entry,
    webdav_password_entry,
    AccountInfo,
    CodexAuthFile,
    ScanResult,
};
use std::fs;
use std::path::PathBuf;

fn persist_active_account_file(path: Option<&PathBuf>) -> Result<(), String> {
    let mut config = load_config();
    config.active_account_file = path.map(|value| value.to_string_lossy().to_string());
    save_config(&config).map_err(|error| error.message.clone())
}

fn loaded_active_account_path(accounts_dir: &PathBuf) -> Option<PathBuf> {
    load_config()
        .active_account_file
        .and_then(|value| resolve_managed_account_path(&value, accounts_dir).ok())
}

fn configured_active_account_path(accounts_dir: &PathBuf, codex_auth: &PathBuf) -> Option<PathBuf> {
    let configured_path = loaded_active_account_path(accounts_dir)?;

    if !configured_path.exists() || !codex_auth.exists() {
        return None;
    }

    Some(configured_path)
}

fn resolve_active_account_path(
    account_files: &[ParsedAccountFile],
    accounts_dir: &PathBuf,
    codex_auth: &PathBuf,
) -> Option<PathBuf> {
    if !codex_auth.exists() {
        return None;
    }

    let exact_match = account_files
        .iter()
        .find(|file| files_have_same_content(&file.path, codex_auth))
        .map(|file| file.path.clone());

    if let Some(exact_match_path) = exact_match {
        return Some(exact_match_path);
    }

    configured_active_account_path(accounts_dir, codex_auth)
}

/// Scan accounts directory and return all available accounts
#[tauri::command]
pub fn scan_accounts() -> Result<ScanResult, String> {
    let accounts_dir = get_accounts_dir();
    let codex_auth = get_codex_auth_file();

    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts directory: {}", e))?;
    }

    let mut account_files = collect_account_files(&accounts_dir, Some(&codex_auth))?;
    account_files.sort_by(|a, b| a.path.to_string_lossy().cmp(&b.path.to_string_lossy()));
    let active_account_path = resolve_active_account_path(&account_files, &accounts_dir, &codex_auth);

    let accounts = account_files
        .into_iter()
        .map(|file| {
            let (email, plan_type, subscription_end, expires_at) = extract_info_from_auth(&file.auth);
            let name = file
                .path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();
            let is_active = active_account_path
                .as_ref()
                .map(|path| paths_match(&file.path, path))
                .unwrap_or(false);

            AccountInfo {
                id: file.auth.tokens.account_id,
                name,
                email,
                plan_type,
                subscription_end,
                is_active,
                file_path: file.path.to_string_lossy().to_string(),
                auth_updated_at: file.modified_at,
                expires_at,
                last_refresh: file.auth.last_refresh,
            }
        })
        .collect();

    Ok(ScanResult {
        accounts,
        accounts_dir: accounts_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn switch_account(file_path: String) -> Result<(), String> {
    let source = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    let target = get_codex_auth_file();

    if !source.exists() {
        return Err("Authentication file does not exist".to_string());
    }

    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    fs::copy(&source, &target).map_err(|e| format!("Failed to copy authentication file: {}", e))?;
    persist_active_account_file(Some(&source))?;
    Ok(())
}

#[tauri::command]
pub fn open_accounts_dir() -> Result<String, String> {
    let dir = get_accounts_dir();
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_accounts_dir_path() -> String {
    let dir = get_accounts_dir();
    let _ = fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_webdav_password() -> AppResult<Option<String>> {
    let entry = webdav_password_entry()?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::secure_storage(format!("Failed to load WebDAV password: {}", e))),
    }
}

#[tauri::command]
pub fn set_webdav_password(password: String) -> AppResult<()> {
    let entry = webdav_password_entry()?;
    if password.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::secure_storage(format!("Failed to clear WebDAV password: {}", e))),
        };
    }

    entry
        .set_password(&password)
        .map_err(|e| AppError::secure_storage(format!("Failed to save WebDAV password: {}", e)))
}

#[tauri::command]
pub fn get_gateway_platform_key() -> AppResult<Option<String>> {
    let entry = gateway_platform_key_entry()?;
    match entry.get_password() {
        Ok(platform_key) => Ok(Some(platform_key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::secure_storage(format!("Failed to load gateway platform key: {}", e))),
    }
}

#[tauri::command]
pub fn set_gateway_platform_key(platform_key: String) -> AppResult<()> {
    let entry = gateway_platform_key_entry()?;
    if platform_key.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::secure_storage(format!("Failed to clear gateway platform key: {}", e))),
        };
    }

    entry
        .set_password(&platform_key)
        .map_err(|e| AppError::secure_storage(format!("Failed to save gateway platform key: {}", e)))
}

#[tauri::command]
pub fn set_accounts_dir(path: String) -> Result<(), String> {
    let old_dir = get_accounts_dir();
    let new_dir = PathBuf::from(&path);

    let mut config = load_config();
    config.accounts_dir = Some(path.clone());
    if let Some(active_path) = config.active_account_file.clone() {
        if resolve_managed_account_path(&active_path, &old_dir).is_ok() {
            config.active_account_file = None;
        }
    }
    save_config(&config).map_err(|e| e.message.clone())?;

    if !paths_match(&old_dir, &new_dir) && old_dir.exists() {
        if !new_dir.exists() {
            fs::create_dir_all(&new_dir).map_err(|e| format!("Failed to create new directory: {}", e))?;
        }

        let mut source_files = collect_account_files(&old_dir, None)?;
        source_files.sort_by(|a, b| a.path.to_string_lossy().cmp(&b.path.to_string_lossy()));

        for file in source_files {
            let preferred_target = match file.path.file_name() {
                Some(file_name) => new_dir.join(file_name),
                None => resolve_available_account_target(&new_dir, "account"),
            };

            if preferred_target.exists() {
                if files_have_same_content(&file.path, &preferred_target) {
                    continue;
                }

                let file_stem = file
                    .path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("account");
                let target_path = resolve_available_account_target(&new_dir, file_stem);
                fs::copy(&file.path, &target_path).map_err(|e| {
                    format!("Failed to copy '{}' to new directory: {}", file.path.to_string_lossy(), e)
                })?;
                continue;
            }

            fs::copy(&file.path, &preferred_target).map_err(|e| {
                format!("Failed to copy '{}' to new directory: {}", file.path.to_string_lossy(), e)
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn rename_account(old_path: String, new_name: String) -> Result<(), String> {
    let accounts_dir = get_accounts_dir();
    let source = resolve_managed_account_path(&old_path, &accounts_dir)?;
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    let was_active = loaded_active_account_path(&accounts_dir)
        .is_some_and(|active_path| paths_match(&active_path, &source));
    let parent = source.parent().ok_or("Invalid path")?;
    let target = parent.join(format!("{}.json", new_name));

    if target.exists() {
        return Err("Target name already exists".to_string());
    }

    fs::rename(&source, &target).map_err(|e| format!("Failed to rename: {}", e))?;
    if was_active {
        persist_active_account_file(Some(&target))?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_account_content(file_path: String) -> Result<String, String> {
    let path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    serde_json::to_string_pretty(&parsed).map_err(|e| format!("Failed to format JSON: {}", e))
}

#[tauri::command]
pub fn update_account_content(file_path: String, content: String) -> Result<(), String> {
    let path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let auth: CodexAuthFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON format: {}", e))?;
    let pretty_content =
        serde_json::to_string_pretty(&auth).map_err(|e| format!("Failed to serialize: {}", e))?;

    fs::write(&path, pretty_content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn add_account(name: String, content: String) -> Result<(), String> {
    let auth: CodexAuthFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON format: {}", e))?;

    let file_name = if !name.trim().is_empty() {
        name.trim().to_string()
    } else {
        let (email, _, _, _) = extract_info_from_auth(&auth);
        if email != "Unknown" {
            email
        } else {
            format!(
                "account_{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
            )
        }
    };

    let accounts_dir = get_accounts_dir();
    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts directory: {}", e))?;
    }

    let target_path = accounts_dir.join(format!("{}.json", file_name));
    if target_path.exists() {
        return Err(format!("Account '{}' already exists", file_name));
    }

    let pretty_content =
        serde_json::to_string_pretty(&auth).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(target_path, pretty_content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_account(file_path: String) -> Result<(), String> {
    let accounts_dir = get_accounts_dir();
    let path = resolve_managed_account_path(&file_path, &accounts_dir)?;
    if !path.exists() {
        return Err("Account file not found".to_string());
    }

    let was_active = loaded_active_account_path(&accounts_dir)
        .is_some_and(|active_path| paths_match(&active_path, &path));
    fs::remove_file(&path).map_err(|e| format!("Failed to delete account: {}", e))?;
    if was_active {
        persist_active_account_file(None)?;
    }
    Ok(())
}
