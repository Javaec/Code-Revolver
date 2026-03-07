use crate::account_files::{
    collect_account_files,
    files_have_same_content,
    paths_match,
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
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Scan accounts directory and return all available accounts
#[tauri::command]
pub fn scan_accounts() -> Result<ScanResult, String> {
    let accounts_dir = get_accounts_dir();
    let codex_auth = get_codex_auth_file();

    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts directory: {}", e))?;
    }

    let active_account_id = if codex_auth.exists() {
        fs::read_to_string(&codex_auth)
            .ok()
            .and_then(|content| serde_json::from_str::<CodexAuthFile>(&content).ok())
            .map(|auth| auth.tokens.account_id)
    } else {
        None
    };

    let mut account_files = collect_account_files(&accounts_dir, Some(&codex_auth))?;
    account_files.sort_by(|a, b| a.path.to_string_lossy().cmp(&b.path.to_string_lossy()));

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
            let is_active = active_account_id
                .as_ref()
                .map(|id| id == &file.auth.tokens.account_id)
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
    let source = resolve_managed_account_path(&old_path, &get_accounts_dir())?;
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }

    let parent = source.parent().ok_or("Invalid path")?;
    let target = parent.join(format!("{}.json", new_name));

    if target.exists() {
        return Err("Target name already exists".to_string());
    }

    fs::rename(source, target).map_err(|e| format!("Failed to rename: {}", e))?;
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
    let path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    if !path.exists() {
        return Err("Account file not found".to_string());
    }

    fs::remove_file(path).map_err(|e| format!("Failed to delete account: {}", e))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitWindow {
    #[serde(rename = "usedPercent")]
    pub used_percent: f64,
    #[serde(rename = "windowMinutes")]
    pub window_minutes: Option<i64>,
    #[serde(rename = "resetsAt")]
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    #[serde(rename = "primaryWindow")]
    pub primary_window: Option<RateLimitWindow>,
    #[serde(rename = "secondaryWindow")]
    pub secondary_window: Option<RateLimitWindow>,
    #[serde(rename = "planType")]
    pub plan_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiRateLimitWindow {
    used_percent: f64,
    limit_window_seconds: Option<i32>,
    reset_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ApiRateLimitDetails {
    primary_window: Option<ApiRateLimitWindow>,
    secondary_window: Option<ApiRateLimitWindow>,
}

#[derive(Debug, Deserialize)]
struct ApiUsageResponse {
    rate_limit: Option<ApiRateLimitDetails>,
    plan_type: Option<String>,
}

#[tauri::command]
pub async fn fetch_usage(file_path: String) -> Result<UsageInfo, String> {
    let validated_path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    let content = fs::read_to_string(&validated_path)
        .map_err(|e| format!("Failed to read authentication file: {}", e))?;

    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse authentication file: {}", e))?;

    let access_token = &auth.tokens.access_token;
    let account_id = &auth.tokens.account_id;

    let client = reqwest::Client::new();
    let urls = vec![
        "https://chatgpt.com/backend-api/wham/usage",
        "https://api.openai.com/backend-api/wham/usage",
        "https://api.openai.com/api/codex/usage",
        "https://chat.openai.com/backend-api/wham/usage",
    ];

    let mut final_response = None;
    let mut attempt_errors: Vec<String> = Vec::new();

    for url in urls {
        let mut request = client
            .get(url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .header("Origin", "https://chatgpt.com");

        if !account_id.is_empty() {
            request = request.header("ChatGPT-Account-Id", account_id);
        }

        match request.send().await {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    final_response = Some(resp);
                    break;
                } else {
                    attempt_errors.push(format!("{} -> HTTP {}", url, status));
                }
            }
            Err(e) => {
                attempt_errors.push(format!("{} -> {}", url, e));
            }
        }
    }

    let response = final_response.ok_or_else(|| {
        if attempt_errors.is_empty() {
            "All API requests failed".to_string()
        } else {
            format!("All API requests failed: {}", attempt_errors.join(" | "))
        }
    })?;

    let api_response: ApiUsageResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let map_window = |w: Option<ApiRateLimitWindow>| -> Option<RateLimitWindow> {
        w.map(|window| RateLimitWindow {
            used_percent: window.used_percent,
            window_minutes: window.limit_window_seconds.map(|s| (s as i64 + 59) / 60),
            resets_at: window.reset_at,
        })
    };

    let (primary, secondary) = match api_response.rate_limit {
        Some(details) => (
            map_window(details.primary_window),
            map_window(details.secondary_window),
        ),
        None => (None, None),
    };

    Ok(UsageInfo {
        primary_window: primary,
        secondary_window: secondary,
        plan_type: api_response.plan_type,
    })
}

#[derive(Debug, Serialize)]
struct TokenRefreshRequest {
    client_id: &'static str,
    grant_type: &'static str,
    refresh_token: String,
    scope: &'static str,
}

#[derive(Debug, Deserialize)]
struct TokenRefreshResponse {
    id_token: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

const CODEX_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_REFRESH_URL: &str = "https://auth.openai.com/oauth/token";

#[tauri::command]
pub async fn refresh_account_token(file_path: String) -> Result<String, String> {
    let validated_path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    let content = fs::read_to_string(&validated_path)
        .map_err(|e| format!("Failed to read authentication file: {}", e))?;

    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse authentication file: {}", e))?;

    let refresh_request = TokenRefreshRequest {
        client_id: CODEX_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: auth.tokens.refresh_token.clone(),
        scope: "openid profile email",
    };

    let client = reqwest::Client::new();
    let response = client
        .post(TOKEN_REFRESH_URL)
        .header("Content-Type", "application/json")
        .json(&refresh_request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();

        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(error) = error_json.get("error") {
                let error_code = error
                    .get("code")
                    .or_else(|| error_json.get("code"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                return match error_code {
                    "refresh_token_expired" => Err("Refresh Token expired, please log in to Codex CLI again".to_string()),
                    "refresh_token_reused" => Err("Refresh Token reused, please log in to Codex CLI again".to_string()),
                    "refresh_token_invalidated" => Err("Refresh Token invalidated, please log in to Codex CLI again".to_string()),
                    _ => Err(format!("Refresh failed: {} - {}", status, body)),
                };
            }
        }

        return Err(format!("Refresh failed: HTTP {} - {}", status, body));
    }

    let refresh_response: TokenRefreshResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mut updated_auth = auth.clone();
    if let Some(new_access_token) = refresh_response.access_token {
        updated_auth.tokens.access_token = new_access_token;
    }
    if let Some(new_id_token) = refresh_response.id_token {
        updated_auth.tokens.id_token = new_id_token;
    }
    if let Some(new_refresh_token) = refresh_response.refresh_token {
        updated_auth.tokens.refresh_token = new_refresh_token;
    }

    updated_auth.last_refresh = chrono::Utc::now().to_rfc3339();

    let updated_content =
        serde_json::to_string_pretty(&updated_auth).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&validated_path, &updated_content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok("Token refresh successful".to_string())
}

#[tauri::command]
pub fn import_default_account() -> Result<bool, String> {
    let codex_auth = get_codex_auth_file();
    let accounts_dir = get_accounts_dir();

    if !codex_auth.exists() {
        return Ok(false);
    }

    if accounts_dir.exists() {
        if let Ok(entries) = fs::read_dir(&accounts_dir) {
            if entries
                .flatten()
                .any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
            {
                return Ok(false);
            }
        }
    } else {
        fs::create_dir_all(&accounts_dir).map_err(|e| e.to_string())?;
    }

    let target_path = accounts_dir.join("default.json");
    if !target_path.exists() {
        fs::copy(&codex_auth, &target_path)
            .map_err(|e| format!("Failed to copy default account: {}", e))?;
        return Ok(true);
    }

    Ok(false)
}
