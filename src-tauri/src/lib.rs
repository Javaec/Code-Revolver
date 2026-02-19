use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Emitter, Manager};

// ========== Data Structures ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexTokens {
    pub access_token: String,
    pub account_id: String,
    pub id_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexAuthFile {
    #[serde(rename = "OPENAI_API_KEY")]
    pub openai_api_key: Option<String>,
    pub last_refresh: String,
    pub tokens: CodexTokens,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub id: String,           // account_id
    pub name: String,         // File name (without extension)
    pub email: String,        // Parsed from JWT
    #[serde(rename = "planType")]
    pub plan_type: String,
    #[serde(rename = "subscriptionEnd")]
    pub subscription_end: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "filePath")]
    pub file_path: String,    // Full path to the auth file
    #[serde(rename = "authUpdatedAt")]
    pub auth_updated_at: i64, // Unix ms from auth.json file modified time
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<i64>, // Token expiration timestamp
    #[serde(rename = "lastRefresh")]
    pub last_refresh: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub accounts: Vec<AccountInfo>,
    #[serde(rename = "accountsDir")]
    pub accounts_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub accounts_dir: Option<String>,
}

// ========== Path Helpers ==========

fn get_config_file() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".myswitch").join("config.json")
}

fn load_config() -> AppConfig {
    let config_path = get_config_file();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    AppConfig::default()
}

fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_file();
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_accounts_dir() -> PathBuf {
    let config = load_config();
    if let Some(dir) = config.accounts_dir {
        let path = PathBuf::from(dir);
        if path.exists() {
            return path;
        }
    }
    // Default path
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".myswitch").join("accounts")
}

fn get_codex_auth_file() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".codex").join("auth.json")
}

fn paths_match(a: &PathBuf, b: &PathBuf) -> bool {
    if a == b {
        return true;
    }

    let a_canonical = fs::canonicalize(a).ok();
    let b_canonical = fs::canonicalize(b).ok();
    if let (Some(a_path), Some(b_path)) = (a_canonical, b_canonical) {
        return a_path == b_path;
    }

    #[cfg(target_os = "windows")]
    {
        return a
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.to_string_lossy());
    }

    #[cfg(not(target_os = "windows"))]
    {
        a.to_string_lossy() == b.to_string_lossy()
    }
}

// ========== JWT Parsing ==========

fn decode_jwt_payload(token: &str) -> Option<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    
    // Base64 URL decoding
    let payload = parts[1];
    let payload = payload.replace('-', "+").replace('_', "/");
    
    // Add padding
    let padding = match payload.len() % 4 {
        0 => 0,
        2 => 2,
        3 => 1,
        _ => return None,
    };
    let payload = format!("{}{}", payload, "=".repeat(padding));
    
    // Decode
    use std::io::Read;
    let mut decoder = base64::read::DecoderReader::new(
        payload.as_bytes(),
        &base64::engine::general_purpose::STANDARD,
    );
    let mut decoded = Vec::new();
    decoder.read_to_end(&mut decoded).ok()?;
    
    serde_json::from_slice(&decoded).ok()
}

fn extract_info_from_auth(auth: &CodexAuthFile) -> (String, String, Option<String>, Option<i64>) {
    // Try to parse from id_token
    if let Some(payload) = decode_jwt_payload(&auth.tokens.id_token) {
        let email = payload.get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
            
        let expires_at = payload.get("exp")
            .and_then(|v| v.as_i64());
        
        let auth_data = payload.get("https://api.openai.com/auth");
        
        let plan_type = auth_data
            .and_then(|a| a.get("chatgpt_plan_type"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        
        let subscription_end = auth_data
            .and_then(|a| a.get("chatgpt_subscription_active_until"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        
        return (email, plan_type, subscription_end, expires_at);
    }
    
    ("Unknown".to_string(), "unknown".to_string(), None, None)
}

// ========== Tauri Commands ==========

/// Scan accounts directory and return all available accounts
#[tauri::command]
fn scan_accounts() -> Result<ScanResult, String> {
    let accounts_dir = get_accounts_dir();
    let codex_auth = get_codex_auth_file();
    
    // Ensure directory exists
    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts directory: {}", e))?;
    }
    
    // Read currently active account_id
    let active_account_id = if codex_auth.exists() {
        fs::read_to_string(&codex_auth)
            .ok()
            .and_then(|content| serde_json::from_str::<CodexAuthFile>(&content).ok())
            .map(|auth| auth.tokens.account_id)
    } else {
        None
    };
    
    // Scan all json files in the directory
    let mut accounts = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&accounts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            
            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // Avoid listing the runtime auth mirror file as a separate profile.
            if paths_match(&path, &codex_auth) {
                continue;
            }
            
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to read account file metadata: {}", e))?;
            let modified_at = metadata
                .modified()
                .map_err(|e| format!("Failed to read account file modified time: {}", e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("Failed to compute account file modified time: {}", e))?
                .as_millis() as i64;

            // Read and parse
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(auth) = serde_json::from_str::<CodexAuthFile>(&content) {
                    let (email, plan_type, subscription_end, expires_at) = extract_info_from_auth(&auth);
                    
                    let name = path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Untitled")
                        .to_string();
                    
                    let is_active = active_account_id.as_ref()
                        .map(|id| id == &auth.tokens.account_id)
                        .unwrap_or(false);
                    
                    accounts.push(AccountInfo {
                        id: auth.tokens.account_id,
                        name,
                        email,
                        plan_type,
                        subscription_end,
                        is_active,
                        file_path: path.to_string_lossy().to_string(),
                        auth_updated_at: modified_at,
                        expires_at,
                        last_refresh: auth.last_refresh.clone(),
                    });
                }
            }
        }
    }
    
    Ok(ScanResult {
        accounts,
        accounts_dir: accounts_dir.to_string_lossy().to_string(),
    })
}

/// Switch to specified account (copy auth file to ~/.codex/auth.json)
#[tauri::command]
fn switch_account(file_path: String) -> Result<(), String> {
    let source = PathBuf::from(&file_path);
    let target = get_codex_auth_file();
    
    if !source.exists() {
        return Err("Authentication file does not exist".to_string());
    }
    
    // Ensure target directory exists
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    
    // Copy file
    fs::copy(&source, &target)
        .map_err(|e| format!("Failed to copy authentication file: {}", e))?;
    
    Ok(())
}

/// Open accounts directory
#[tauri::command]
fn open_accounts_dir() -> Result<String, String> {
    let dir = get_accounts_dir();
    // Ensure directory exists
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // Open directory using system command
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

/// Get account directory path
#[tauri::command]
fn get_accounts_dir_path() -> String {
    let dir = get_accounts_dir();
    let _ = fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

/// Get app configuration
#[tauri::command]
fn get_app_config() -> AppConfig {
    load_config()
}

/// Set accounts directory
#[tauri::command]
fn set_accounts_dir(path: String) -> Result<(), String> {
    let old_dir = get_accounts_dir();
    let new_dir = PathBuf::from(&path);

    // Save configuration
    let mut config = load_config();
    config.accounts_dir = Some(path.clone());
    save_config(&config)?;

    // Auto-copy specific logic
    if old_dir != new_dir && old_dir.exists() {
         // Create new directory if needed
        if !new_dir.exists() {
            fs::create_dir_all(&new_dir).map_err(|e| format!("Failed to create new directory: {}", e))?;
        }

        // Iterate and copy
        if let Ok(entries) = fs::read_dir(&old_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_file() && entry_path.extension().map_or(false, |ext| ext == "json") {
                    if let Some(file_name) = entry_path.file_name() {
                        let target_path = new_dir.join(file_name);
                        // Copy but don't error if fail (e.g. exists)
                        if !target_path.exists() {
                            let _ = fs::copy(&entry_path, &target_path);
                        }
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Rename account
#[tauri::command]
fn rename_account(old_path: String, new_name: String) -> Result<(), String> {
    let source = PathBuf::from(&old_path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }
    
    let parent = source.parent().ok_or("Invalid path")?;
    let target = parent.join(format!("{}.json", new_name));
    
    if target.exists() {
        return Err("Target name already exists".to_string());
    }
    
    fs::rename(source, target)
        .map_err(|e| format!("Failed to rename: {}", e))?;
        
    Ok(())
}

/// Read account file content
#[tauri::command]
fn read_account_content(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Format JSON
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("Failed to format JSON: {}", e))
}

/// Update account file content
#[tauri::command]
fn update_account_content(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    
    // Validate JSON format
    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;
    
    // Format and write
    let pretty_content = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    
    fs::write(&path, pretty_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(())
}

/// Add account (Save raw JSON content)
#[tauri::command]
fn add_account(name: String, content: String) -> Result<(), String> {
    // 1. Validate JSON format
    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON format: {}", e))?;
    
    // 2. Decide filename
    let file_name = if !name.trim().is_empty() {
        name.trim().to_string()
    } else {
        // Try to extract email from token
        let (email, _, _, _) = extract_info_from_auth(&auth);
        if email != "Unknown" {
            email
        } else {
            // Random or default
             format!("account_{}",  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs())
        }
    };

    // 3. Build path
    let accounts_dir = get_accounts_dir();
    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to create accounts directory: {}", e))?;
    }
    
    let target_path = accounts_dir.join(format!("{}.json", file_name));
    
    // 4. Check if exists
    if target_path.exists() {
        return Err(format!("Account '{}' already exists", file_name));
    }
    
    // 5. Write file (Pretty Print)
    let pretty_content = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    
    fs::write(target_path, pretty_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
        
    Ok(())
}

/// Delete account
#[tauri::command]
fn delete_account(file_path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(file_path);
    if !path.exists() {
        return Err("Account file not found".to_string());
    }
    
    fs::remove_file(path)
        .map_err(|e| format!("Failed to delete account: {}", e))?;
        
    Ok(())
}

// ========== Usage Query ==========

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

// API Response Structures
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

/// Fetch account usage information
#[tauri::command]
async fn fetch_usage(file_path: String) -> Result<UsageInfo, String> {
    // Read auth file
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read authentication file: {}", e))?;
    
    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse authentication file: {}", e))?;
    
    let access_token = &auth.tokens.access_token;
    let account_id = &auth.tokens.account_id;
    
    // Call OpenAI API
    let client = reqwest::Client::new();
    
    // Try different Base URL and Path combinations
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
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .header("Origin", "https://chatgpt.com");
            
        // If account_id exists, it must be included
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
            },
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
    
    // Try to parse, compatible with different response formats
    let api_response: ApiUsageResponse = response.json().await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;
    
    // Convert response format
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

// ========== WebDAV Synchronization ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavConfig {
    pub url: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "remotePath")]
    pub remote_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub uploaded: Vec<String>,
    pub downloaded: Vec<String>,
    pub errors: Vec<String>,
}

/// Create WebDAV client with timeout to avoid hanging
fn webdav_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))  // Increase timeout as some providers might be slow
        .build()
        .map_err(|e| format!("Failed to create WebDAV client: {}", e))
}

/// Normalize remote path, ensuring leading and trailing slashes
fn normalize_remote_path(path: &str) -> String {
    let mut p = path.trim().to_string();
    if !p.starts_with('/') {
        p.insert(0, '/');
    }
    if !p.ends_with('/') {
        p.push('/');
    }
    p
}

/// Upload file to WebDAV
async fn webdav_upload(client: &reqwest::Client, config: &WebDavConfig, filename: &str, content: &str) -> Result<(), String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    // URL encode filename (handle non-ASCII characters)
    let encoded_filename = urlencoding::encode(filename);
    let url = format!("{}{}{}", config.url.trim_end_matches('/'), remote_path, encoded_filename);
    
    println!("[WebDAV] Uploading file: {}", url);
    
    let response = client
        .put(&url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Content-Type", "application/json; charset=utf-8")
        .body(content.to_string())
        .send()
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;
    
    let status = response.status();
    println!("[WebDAV] Upload response status: {}", status);
    
    if status.is_success() || status.as_u16() == 201 {
        Ok(())
    } else {
        Err(format!("Upload failed: HTTP {}", status))
    }
}

/// Download file from WebDAV
async fn webdav_download(client: &reqwest::Client, config: &WebDavConfig, filename: &str) -> Result<String, String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    // URL encode filename (handle non-ASCII characters)
    let encoded_filename = urlencoding::encode(filename);
    let url = format!("{}{}{}", config.url.trim_end_matches('/'), remote_path, encoded_filename);
    
    println!("[WebDAV] Downloading file: {}", url);
    
    let response = client
        .get(&url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    let status = response.status();
    println!("[WebDAV] Download response status: {}", status);
    
    if status.is_success() {
        let content = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        println!("[WebDAV] Download successful: {} ({} bytes)", filename, content.len());
        Ok(content)
    } else {
        Err(format!("Download failed: HTTP {}", status))
    }
}

/// List files in WebDAV directory
async fn webdav_list(client: &reqwest::Client, config: &WebDavConfig) -> Result<Vec<String>, String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path);
    
    println!("[WebDAV] List directory request: {}", url);
    
    let response = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Accept", "*/*")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/></prop></propfind>"#)
        .send()
        .await
        .map_err(|e| format!("Failed to list directory: {}", e))?;
    
    let status = response.status();
    println!("[WebDAV] List directory response status: {}", status);
    
    if !status.is_success() && status.as_u16() != 207 {
        return Err(format!("Failed to list directory: HTTP {}", status));
    }
    
    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    println!("[WebDAV] Response length: {} bytes", body.len());
    println!("[WebDAV] Response content: {}", &body[..body.len().min(500)]);
    
    // Extract href content using simple string matching
    let mut files = Vec::new();
    
    // Match <d:href>...</d:href> or <D:href>...</D:href> or <href>...</href>
    let href_patterns = ["<d:href>", "<D:href>", "<href>"];
    let href_end_patterns = ["</d:href>", "</D:href>", "</href>"];
    
    for (start_pat, end_pat) in href_patterns.iter().zip(href_end_patterns.iter()) {
        let mut search_pos = 0;
        while let Some(start_idx) = body[search_pos..].find(start_pat) {
            let abs_start = search_pos + start_idx + start_pat.len();
            if let Some(end_idx) = body[abs_start..].find(end_pat) {
                let href_content = &body[abs_start..abs_start + end_idx];
                println!("[WebDAV] Found href: {}", href_content);
                
                // URL Decode
                let decoded = urlencoding::decode(href_content).unwrap_or_else(|_| href_content.into());
                
                // Extract filename
                if let Some(name) = decoded.rsplit('/').next() {
                    if name.ends_with(".json") && !name.is_empty() {
                        println!("[WebDAV] Found file: {}", name);
                        if !files.contains(&name.to_string()) {
                            files.push(name.to_string());
                        }
                    }
                }
                search_pos = abs_start + end_idx;
            } else {
                break;
            }
        }
    }
    
    println!("[WebDAV] Found {} JSON files total", files.len());
    Ok(files)
}

/// Ensure WebDAV remote directory exists
async fn webdav_ensure_dir(client: &reqwest::Client, config: &WebDavConfig) -> Result<(), String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path.trim_end_matches('/'));
    
    let response = client
        .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
        .basic_auth(&config.username, Some(&config.password))
        .send()
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    // 201 Created, 405 Already exists, 301 Redirect - all OK
    let status = response.status().as_u16();
    if status == 201 || status == 405 || status == 301 || response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to create directory: HTTP {}", response.status()))
    }
}

/// Sync accounts to WebDAV (Upload local accounts to accounts/ subdirectory)
#[tauri::command]
async fn webdav_sync_upload(config: WebDavConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();
    
    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };
    
    // Ensure remote root exists
    if let Err(e) = webdav_ensure_dir(&client, &config).await {
        println!("Creating root directory: {}", e);
    }
    
    // Create accounts subdirectory
    let accounts_remote_path = format!("{}accounts/", config.remote_path.trim_end_matches('/'));
    let accounts_config = WebDavConfig {
        url: config.url.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        remote_path: accounts_remote_path,
    };
    if let Err(e) = webdav_ensure_dir(&client, &accounts_config).await {
        println!("Creating accounts directory: {}", e);
    }
    
    // Read local files and upload to accounts/ subdirectory
    if let Ok(entries) = fs::read_dir(&accounts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    match fs::read_to_string(&path) {
                        Ok(content) => {
                            match webdav_upload(&client, &accounts_config, filename, &content).await {
                                Ok(_) => result.uploaded.push(filename.to_string()),
                                Err(e) => result.errors.push(format!("{}: {}", filename, e)),
                            }
                        }
                        Err(e) => result.errors.push(format!("{}: Read failed {}", filename, e)),
                    }
                }
            }
        }
    }
    
    Ok(result)
}

/// Sync accounts from WebDAV (Download from accounts/ subdirectory)
#[tauri::command]
async fn webdav_sync_download(config: WebDavConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();
    
    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };
    
    // Ensure local directory exists
    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir).map_err(|e| format!("Failed to create local directory: {}", e))?;
    }
    
    // Download from accounts/ subdirectory
    let accounts_remote_path = format!("{}accounts/", config.remote_path.trim_end_matches('/'));
    let accounts_config = WebDavConfig {
        url: config.url.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        remote_path: accounts_remote_path,
    };
    
    // List remote files
    let remote_files = webdav_list(&client, &accounts_config).await?;
    
    // Download each file
    for filename in remote_files {
        match webdav_download(&client, &accounts_config, &filename).await {
            Ok(content) => {
                // Validate JSON format
                if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                    let local_path = accounts_dir.join(&filename);
                    match fs::write(&local_path, &content) {
                        Ok(_) => result.downloaded.push(filename),
                        Err(e) => result.errors.push(format!("{}: Write failed {}", filename, e)),
                    }
                } else {
                    result.errors.push(format!("{}: Invalid JSON", filename));
                }
            }
            Err(e) => result.errors.push(format!("{}: {}", filename, e)),
        }
    }
    
    Ok(result)
}

/// Test WebDAV connection
#[tauri::command]
async fn webdav_test_connection(config: WebDavConfig) -> Result<String, String> {
    let client = webdav_client()?;
    let remote_path = normalize_remote_path(&config.remote_path);
    
    // Try PROPFIND on root directory
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path);
    
    let response = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Depth", "0")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    
    let status = response.status();
    if status.is_success() || status.as_u16() == 207 {
        Ok("Connection successful".to_string())
    } else if status.as_u16() == 404 {
        // Directory not found, try to create it
        webdav_ensure_dir(&client, &config).await?;
        Ok("Connection successful, remote directory created".to_string())
    } else if status.as_u16() == 401 {
        Err("Authentication failed: Please check username and application password".to_string())
    } else {
        Err(format!("Connection failed: HTTP {}", status))
    }
}

// ========== Prompts & Skills Management ==========

fn get_codex_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".codex")
}

fn get_prompts_dir() -> PathBuf {
    get_codex_dir().join("prompts")
}

fn get_skills_dir() -> PathBuf {
    get_codex_dir().join("skills")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptInfo {
    pub name: String,
    pub description: String,
    #[serde(rename = "argumentHint")]
    pub argument_hint: Option<String>,
    #[serde(rename = "filePath")]
    pub file_path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub compatibility: Option<String>,
    #[serde(rename = "dirPath")]
    pub dir_path: String,
    #[serde(rename = "hasScripts")]
    pub has_scripts: bool,
    #[serde(rename = "hasAssets")]
    pub has_assets: bool,
    #[serde(rename = "hasReferences")]
    pub has_references: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexSyncConfig {
    #[serde(rename = "syncPrompts")]
    pub sync_prompts: bool,
    #[serde(rename = "syncSkills")]
    pub sync_skills: bool,
    #[serde(rename = "syncAgentsMd")]
    pub sync_agents_md: bool,
    #[serde(rename = "syncConfigToml")]
    pub sync_config_toml: bool,
}

impl Default for CodexSyncConfig {
    fn default() -> Self {
        Self {
            sync_prompts: true,
            sync_skills: true,
            sync_agents_md: true,
            sync_config_toml: false,
        }
    }
}

/// Parse Markdown frontmatter (YAML)
fn parse_frontmatter(content: &str) -> Option<serde_json::Value> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }
    
    let rest = &content[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let yaml_str = rest[..end_idx].trim();
        // Simple YAML-to-JSON parser
        let mut map = serde_json::Map::new();
        for line in yaml_str.lines() {
            if let Some(colon_idx) = line.find(':') {
                let key = line[..colon_idx].trim().to_string();
                let value = line[colon_idx + 1..].trim();
                // Remove quotes
                let value = value.trim_matches('"').trim_matches('\'');
                // Handle multi-line values (starting with > or |)
                if value == ">" || value == "|" {
                    continue; 
                }
                map.insert(key, serde_json::Value::String(value.to_string()));
            }
        }
        if !map.is_empty() {
            return Some(serde_json::Value::Object(map));
        }
    }
    None
}

/// Recursively scan prompts directory
fn scan_prompts_recursive(dir: &PathBuf, prompts: &mut Vec<PromptInfo>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Recursively scan subdirectories
                scan_prompts_recursive(&path, prompts);
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(content) = fs::read_to_string(&path) {
                    let frontmatter = parse_frontmatter(&content);
                    
                    let name = path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Untitled")
                        .to_string();
                    
                    let description = frontmatter.as_ref()
                        .and_then(|fm| fm.get("description"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    
                    let argument_hint = frontmatter.as_ref()
                        .and_then(|fm| fm.get("argument-hint"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    
                    prompts.push(PromptInfo {
                        name,
                        description,
                        argument_hint,
                        file_path: path.to_string_lossy().to_string(),
                        content,
                    });
                }
            }
        }
    }
}

/// Scan all prompts
#[tauri::command]
fn scan_prompts() -> Result<Vec<PromptInfo>, String> {
    let prompts_dir = get_prompts_dir();
    let mut prompts = Vec::new();
    
    if prompts_dir.exists() {
        scan_prompts_recursive(&prompts_dir, &mut prompts);
    }
    
    Ok(prompts)
}

/// Scan all skills
#[tauri::command]
fn scan_skills() -> Result<Vec<SkillInfo>, String> {
    let skills_dir = get_skills_dir();
    let mut skills = Vec::new();
    
    if !skills_dir.exists() {
        return Ok(skills);
    }
    
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            
            // Skip .system and dist directories
            let dir_name = path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if dir_name.starts_with('.') || dir_name == "dist" {
                continue;
            }
            
            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }
            
            if let Ok(content) = fs::read_to_string(&skill_md) {
                let frontmatter = parse_frontmatter(&content);
                
                let name = frontmatter.as_ref()
                    .and_then(|fm| fm.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(dir_name)
                    .to_string();
                
                let description = frontmatter.as_ref()
                    .and_then(|fm| fm.get("description"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                
                let compatibility = frontmatter.as_ref()
                    .and_then(|fm| fm.get("compatibility"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                
                skills.push(SkillInfo {
                    name,
                    description,
                    compatibility,
                    dir_path: path.to_string_lossy().to_string(),
                    has_scripts: path.join("scripts").exists(),
                    has_assets: path.join("assets").exists(),
                    has_references: path.join("references").exists(),
                });
            }
        }
    }
    
    Ok(skills)
}

/// Read prompt content
#[tauri::command]
fn read_prompt_content(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Save prompt content
#[tauri::command]
fn save_prompt_content(file_path: String, content: String) -> Result<(), String> {
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

/// Create new prompt
#[tauri::command]
fn create_prompt(name: String, description: String, content: String) -> Result<String, String> {
    let prompts_dir = get_prompts_dir();
    if !prompts_dir.exists() {
        fs::create_dir_all(&prompts_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    let file_name = format!("{}.md", name);
    let file_path = prompts_dir.join(&file_name);
    
    if file_path.exists() {
        return Err(format!("Prompt '{}' already exists", name));
    }
    
    let full_content = format!(
        "---\ndescription: {}\n---\n\n{}",
        description, content
    );
    
    fs::write(&file_path, full_content)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

/// Delete prompt
#[tauri::command]
fn delete_prompt(file_path: String) -> Result<(), String> {
    fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete file: {}", e))
}

/// Read skill SKILL.md content
#[tauri::command]
fn read_skill_content(dir_path: String) -> Result<String, String> {
    let skill_md = PathBuf::from(&dir_path).join("SKILL.md");
    fs::read_to_string(&skill_md)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Save skill SKILL.md content
#[tauri::command]
fn save_skill_content(dir_path: String, content: String) -> Result<(), String> {
    let skill_md = PathBuf::from(&dir_path).join("SKILL.md");
    fs::write(&skill_md, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

/// Create new skill
#[tauri::command]
fn create_skill(name: String, description: String) -> Result<String, String> {
    let skills_dir = get_skills_dir();
    let skill_dir = skills_dir.join(&name);
    
    if skill_dir.exists() {
        return Err(format!("Skill '{}' already exists", name));
    }
    
    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    let skill_md_content = format!(
        "---\nname: {}\ndescription: {}\n---\n\n# {}\n\n## When to Use\n- TODO\n\n## When NOT to Use\n- TODO\n\n## Workflow\n1. TODO\n",
        name, description, name
    );
    
    let skill_md = skill_dir.join("SKILL.md");
    fs::write(&skill_md, skill_md_content)
        .map_err(|e| format!("Failed to create SKILL.md: {}", e))?;
    
    Ok(skill_dir.to_string_lossy().to_string())
}

/// Delete skill
#[tauri::command]
fn delete_skill(dir_path: String) -> Result<(), String> {
    fs::remove_dir_all(&dir_path)
        .map_err(|e| format!("Failed to delete directory: {}", e))
}

/// Read AGENTS.MD
#[tauri::command]
fn read_agents_md() -> Result<String, String> {
    let agents_md = get_codex_dir().join("AGENTS.MD");
    if agents_md.exists() {
        fs::read_to_string(&agents_md)
            .map_err(|e| format!("Failed to read file: {}", e))
    } else {
        Ok(String::new())
    }
}

/// Save AGENTS.MD
#[tauri::command]
fn save_agents_md(content: String) -> Result<(), String> {
    let agents_md = get_codex_dir().join("AGENTS.MD");
    fs::write(&agents_md, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

/// Read config.toml
#[tauri::command]
fn read_config_toml() -> Result<String, String> {
    let config_toml = get_codex_dir().join("config.toml");
    if config_toml.exists() {
        fs::read_to_string(&config_toml)
            .map_err(|e| format!("Failed to read file: {}", e))
    } else {
        Ok(String::new())
    }
}

/// Save config.toml
#[tauri::command]
fn save_config_toml(content: String) -> Result<(), String> {
    let config_toml = get_codex_dir().join("config.toml");
    fs::write(&config_toml, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

/// Open Code Revolver directory
#[tauri::command]
fn open_codex_dir() -> Result<String, String> {
    let dir = get_codex_dir();
    
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

// ========== Code Revolver WebDAV Synchronization ==========

/// Sync Code Revolver configuration to WebDAV (prompts, skills, AGENTS.MD)
#[tauri::command]
async fn webdav_sync_codex_upload(config: WebDavConfig, sync_config: CodexSyncConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let codex_dir = get_codex_dir();
    
    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };
    
    // Ensure remote root exists
    if let Err(e) = webdav_ensure_dir(&client, &config).await {
        println!("Creating root directory: {}", e);
    }
    
    let base_path = config.remote_path.trim_end_matches('/');
    
    // Sync AGENTS.MD (directly in root directory)
    if sync_config.sync_agents_md {
        let agents_md = codex_dir.join("AGENTS.MD");
        if agents_md.exists() {
            if let Ok(content) = fs::read_to_string(&agents_md) {
                match webdav_upload(&client, &config, "AGENTS.MD", &content).await {
                    Ok(_) => result.uploaded.push("AGENTS.MD".to_string()),
                    Err(e) => result.errors.push(format!("AGENTS.MD: {}", e)),
                }
            }
        }
    }
    
    // Sync config.toml (directly in root directory)
    if sync_config.sync_config_toml {
        let config_toml = codex_dir.join("config.toml");
        if config_toml.exists() {
            if let Ok(content) = fs::read_to_string(&config_toml) {
                match webdav_upload(&client, &config, "config.toml", &content).await {
                    Ok(_) => result.uploaded.push("config.toml".to_string()),
                    Err(e) => result.errors.push(format!("config.toml: {}", e)),
                }
            }
        }
    }
    
    // Sync prompts
    if sync_config.sync_prompts {
        let prompts_remote = format!("{}/prompts/", base_path);
        let prompts_config = WebDavConfig {
            url: config.url.clone(),
            username: config.username.clone(),
            password: config.password.clone(),
            remote_path: prompts_remote,
        };
        let _ = webdav_ensure_dir(&client, &prompts_config).await;
        
        let prompts_dir = get_prompts_dir();
        if prompts_dir.exists() {
            upload_dir_recursive(&client, &prompts_config, &prompts_dir, &mut result).await;
        }
    }
    
    // Sync skills
    if sync_config.sync_skills {
        let skills_remote = format!("{}/skills/", base_path);
        let skills_config = WebDavConfig {
            url: config.url.clone(),
            username: config.username.clone(),
            password: config.password.clone(),
            remote_path: skills_remote,
        };
        let _ = webdav_ensure_dir(&client, &skills_config).await;
        
        let skills_dir = get_skills_dir();
        if skills_dir.exists() {
            // Traverse skills directory
            if let Ok(entries) = fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let dir_name = path.file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    // Skip .system and dist
                    if dir_name.starts_with('.') || dir_name == "dist" {
                        continue;
                    }
                    
                    // Create remote directory for each skill and upload
                    let skill_remote = format!("{}{}/", skills_config.remote_path, dir_name);
                    let skill_config = WebDavConfig {
                        url: config.url.clone(),
                        username: config.username.clone(),
                        password: config.password.clone(),
                        remote_path: skill_remote,
                    };
                    let _ = webdav_ensure_dir(&client, &skill_config).await;
                    upload_dir_recursive(&client, &skill_config, &path, &mut result).await;
                }
            }
        }
    }
    
    Ok(result)
}

/// Recursively upload directory
async fn upload_dir_recursive(client: &reqwest::Client, config: &WebDavConfig, dir: &PathBuf, result: &mut SyncResult) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            
            // Skip __pycache__ etc.
            if name.starts_with("__") || name.starts_with('.') {
                continue;
            }
            
            if path.is_dir() {
                // Create subdirectory and recurse
                let sub_remote = format!("{}{}/", config.remote_path, name);
                let sub_config = WebDavConfig {
                    url: config.url.clone(),
                    username: config.username.clone(),
                    password: config.password.clone(),
                    remote_path: sub_remote,
                };
                let _ = webdav_ensure_dir(client, &sub_config).await;
                Box::pin(upload_dir_recursive(client, &sub_config, &path, result)).await;
            } else {
                // Upload file
                if let Ok(content) = fs::read_to_string(&path) {
                    match webdav_upload(client, config, name, &content).await {
                        Ok(_) => result.uploaded.push(format!("{}{}", config.remote_path, name)),
                        Err(e) => result.errors.push(format!("{}: {}", name, e)),
                    }
                }
            }
        }
    }
}

/// Download Code Revolver configuration from WebDAV
#[tauri::command]
async fn webdav_sync_codex_download(config: WebDavConfig, sync_config: CodexSyncConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let codex_dir = get_codex_dir();
    
    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };
    
    let codex_remote_path = format!("{}codex/", config.remote_path.trim_end_matches('/'));
    let codex_config = WebDavConfig {
        url: config.url.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        remote_path: codex_remote_path.clone(),
    };
    
    // Download AGENTS.MD
    if sync_config.sync_agents_md {
        match webdav_download(&client, &codex_config, "AGENTS.MD").await {
            Ok(content) => {
                let agents_md = codex_dir.join("AGENTS.MD");
                match fs::write(&agents_md, &content) {
                    Ok(_) => result.downloaded.push("AGENTS.MD".to_string()),
                    Err(e) => result.errors.push(format!("AGENTS.MD: Write failed {}", e)),
                }
            }
            Err(e) => {
                if !e.contains("404") {
                    result.errors.push(format!("AGENTS.MD: {}", e));
                }
            }
        }
    }
    
    // Download prompts
    if sync_config.sync_prompts {
        let prompts_remote = format!("{}prompts/", codex_remote_path);
        let prompts_config = WebDavConfig {
            url: config.url.clone(),
            username: config.username.clone(),
            password: config.password.clone(),
            remote_path: prompts_remote,
        };
        let prompts_dir = get_prompts_dir();
        if !prompts_dir.exists() {
            let _ = fs::create_dir_all(&prompts_dir);
        }
        download_dir_recursive(&client, &prompts_config, &prompts_dir, &mut result).await;
    }
    
    // Download skills
    if sync_config.sync_skills {
        let skills_remote = format!("{}skills/", codex_remote_path);
        let skills_config = WebDavConfig {
            url: config.url.clone(),
            username: config.username.clone(),
            password: config.password.clone(),
            remote_path: skills_remote,
        };
        let skills_dir = get_skills_dir();
        if !skills_dir.exists() {
            let _ = fs::create_dir_all(&skills_dir);
        }
        download_dir_recursive(&client, &skills_config, &skills_dir, &mut result).await;
    }
    
    // Download config.toml
    if sync_config.sync_config_toml {
        match webdav_download(&client, &codex_config, "config.toml").await {
            Ok(remote_content) => {
                let config_toml = codex_dir.join("config.toml");
                match fs::write(&config_toml, &remote_content) {
                    Ok(_) => result.downloaded.push("config.toml".to_string()),
                    Err(e) => result.errors.push(format!("config.toml: Write failed {}", e)),
                }
            }
            Err(e) => {
                if !e.contains("404") && !e.contains("HTTP 404") {
                    result.errors.push(format!("config.toml: {}", e));
                }
            }
        }
    }
    
    Ok(result)
}

/// Recursively download directory
async fn download_dir_recursive(client: &reqwest::Client, config: &WebDavConfig, local_dir: &PathBuf, result: &mut SyncResult) {
    // List remote files
    match webdav_list_all(client, config).await {
        Ok(items) => {
            for item in items {
                if item.ends_with('/') {
                    // It's a directory, recurse
                    let dir_name = item.trim_end_matches('/');
                    let sub_remote = format!("{}{}/", config.remote_path, dir_name);
                    let sub_config = WebDavConfig {
                        url: config.url.clone(),
                        username: config.username.clone(),
                        password: config.password.clone(),
                        remote_path: sub_remote,
                    };
                    let sub_local = local_dir.join(dir_name);
                    if !sub_local.exists() {
                        let _ = fs::create_dir_all(&sub_local);
                    }
                    Box::pin(download_dir_recursive(client, &sub_config, &sub_local, result)).await;
                } else {
                    // It's a file, download
                    match webdav_download(client, config, &item).await {
                        Ok(content) => {
                            let local_path = local_dir.join(&item);
                            match fs::write(&local_path, &content) {
                                Ok(_) => result.downloaded.push(format!("{}{}", config.remote_path, item)),
                                Err(e) => result.errors.push(format!("{}: Write failed {}", item, e)),
                            }
                        }
                        Err(e) => result.errors.push(format!("{}: {}", item, e)),
                    }
                }
            }
        }
        Err(e) => {
            if !e.contains("404") {
                result.errors.push(format!("Failed to list directory: {}", e));
            }
        }
    }
}

/// List all files and subdirectories in WebDAV directory
async fn webdav_list_all(client: &reqwest::Client, config: &WebDavConfig) -> Result<Vec<String>, String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path);
    
    let response = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><resourcetype/></prop></propfind>"#)
        .send()
        .await
        .map_err(|e| format!("Failed to list directory: {}", e))?;
    
    let status = response.status();
    if !status.is_success() && status.as_u16() != 207 {
        return Err(format!("Failed to list directory: HTTP {}", status));
    }
    
    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    
    let mut items = Vec::new();
    let href_patterns = ["<d:href>", "<D:href>", "<href>"];
    let href_end_patterns = ["</d:href>", "</D:href>", "</href>"];
    
    for (start_pat, end_pat) in href_patterns.iter().zip(href_end_patterns.iter()) {
        let mut search_pos = 0;
        let mut first = true;
        while let Some(start_idx) = body[search_pos..].find(start_pat) {
            let abs_start = search_pos + start_idx + start_pat.len();
            if let Some(end_idx) = body[abs_start..].find(end_pat) {
                let href_content = &body[abs_start..abs_start + end_idx];
                let decoded = urlencoding::decode(href_content).unwrap_or_else(|_| href_content.into());
                
                // Skip the first one (the directory itself)
                if first {
                    first = false;
                    search_pos = abs_start + end_idx;
                    continue;
                }
                
                // Extract file/directory name
                let name = decoded.trim_end_matches('/').rsplit('/').next().unwrap_or("");
                if !name.is_empty() && !name.starts_with('.') {
                    // Check for collection marker
                    let check_range = &body[abs_start..body.len().min(abs_start + 500)];
                    let is_dir = check_range.contains("<d:collection") || 
                                 check_range.contains("<D:collection") ||
                                 check_range.contains("<collection");
                    
                    let item_name = if is_dir && !decoded.ends_with('/') {
                        format!("{}/", name)
                    } else if decoded.ends_with('/') {
                        format!("{}/", name)
                    } else {
                        name.to_string()
                    };
                    
                    if !items.contains(&item_name) {
                        items.push(item_name);
                    }
                }
                search_pos = abs_start + end_idx;
            } else {
                break;
            }
        }
    }
    
    Ok(items)
}

// ========== Token Refresh ==========

/// Token refresh request structure
#[derive(Debug, Serialize)]
struct TokenRefreshRequest {
    client_id: &'static str,
    grant_type: &'static str,
    refresh_token: String,
    scope: &'static str,
}

/// Token refresh response structure
#[derive(Debug, Deserialize)]
struct TokenRefreshResponse {
    id_token: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
}

/// Client ID used by Codex CLI (public)
const CODEX_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_REFRESH_URL: &str = "https://auth.openai.com/oauth/token";

/// Refresh token for specified account
#[tauri::command]
async fn refresh_account_token(file_path: String) -> Result<String, String> {
    // Read auth file
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read authentication file: {}", e))?;
    
    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse authentication file: {}", e))?;
    
    let refresh_token = &auth.tokens.refresh_token;
    
    // Build refresh request
    let refresh_request = TokenRefreshRequest {
        client_id: CODEX_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refresh_token.clone(),
        scope: "openid profile email",
    };
    
    println!("[Token Refresh] Starting Token refresh...");
    println!("[Token Refresh] URL: {}", TOKEN_REFRESH_URL);
    
    // Send refresh request
    let client = reqwest::Client::new();
    let response = client
        .post(TOKEN_REFRESH_URL)
        .header("Content-Type", "application/json")
        .json(&refresh_request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    let status = response.status();
    println!("[Token Refresh] Response status: {}", status);
    
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        println!("[Token Refresh] Error response: {}", body);
        
        // Parse error information
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(error) = error_json.get("error") {
                let error_code = error.get("code")
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
    
    // Parse response
    let refresh_response: TokenRefreshResponse = response.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    println!("[Token Refresh] Refresh successful!");
    println!("[Token Refresh] New access_token: {}...", 
        refresh_response.access_token.as_ref().map(|t| &t[..20.min(t.len())]).unwrap_or("None"));
    println!("[Token Refresh] New id_token: {}...", 
        refresh_response.id_token.as_ref().map(|t| &t[..20.min(t.len())]).unwrap_or("None"));
    println!("[Token Refresh] New refresh_token: {}...", 
        refresh_response.refresh_token.as_ref().map(|t| &t[..20.min(t.len())]).unwrap_or("None"));
    
    // Update auth file
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
    
    // Update last_refresh time
    updated_auth.last_refresh = chrono::Utc::now().to_rfc3339();
    
    // Write back to file
    let updated_content = serde_json::to_string_pretty(&updated_auth)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    
    fs::write(&file_path, &updated_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    println!("[Token Refresh] Updated authentication file: {}", file_path);
    
    Ok("Token refresh successful".to_string())
}

// ========== Entry Point ==========

/// Import default account from ~/.codex/auth.json if it exists and no accounts are present
#[tauri::command]
fn import_default_account() -> Result<bool, String> {
    let codex_auth = get_codex_auth_file();
    let accounts_dir = get_accounts_dir();
    
    if !codex_auth.exists() {
        return Ok(false);
    }

    // Check if any accounts already exist
    if accounts_dir.exists() {
        if let Ok(entries) = fs::read_dir(&accounts_dir) {
            if entries.flatten().any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json")) {
                return Ok(false); // Already has accounts
            }
        }
    } else {
        fs::create_dir_all(&accounts_dir).map_err(|e| e.to_string())?;
    }

    let target_path = accounts_dir.join("default.json");
    if !target_path.exists() {
        fs::copy(&codex_auth, &target_path).map_err(|e| format!("Failed to copy default account: {}", e))?;
        return Ok(true);
    }

    Ok(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent default close behavior, hide window instead
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // Setup tray menu
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::TrayIconBuilder;
            
            // Get currently active account info
            let codex_auth = get_codex_auth_file();
            let account_info = if codex_auth.exists() {
                if let Ok(content) = fs::read_to_string(&codex_auth) {
                    if let Ok(auth) = serde_json::from_str::<CodexAuthFile>(&content) {
                        let (email, _, _, _) = extract_info_from_auth(&auth);
                        format!("Current: {}", email)
                    } else {
                        "Current: Unknown".to_string()
                    }
                } else {
                    "Current: Not Configured".to_string()
                }
            } else {
                "Current: Not Configured".to_string()
            };
            
            let account_item = MenuItem::with_id(app, "account", &account_info, false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&account_item, &separator, &show, &refresh, &separator2, &quit])?;
            
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "refresh" => {
                            // Trigger frontend refresh
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-refresh", ());
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_accounts,
            switch_account,
            get_accounts_dir_path,
            open_accounts_dir,
            fetch_usage,
            rename_account,
            get_app_config,
            set_accounts_dir,
            add_account,
            delete_account,
            read_account_content,
            update_account_content,
            webdav_sync_upload,
            webdav_sync_download,
            webdav_test_connection,
            // Prompts & Skills
            scan_prompts,
            scan_skills,
            read_prompt_content,
            save_prompt_content,
            create_prompt,
            delete_prompt,
            read_skill_content,
            save_skill_content,
            create_skill,
            delete_skill,
            read_agents_md,
            save_agents_md,
            read_config_toml,
            save_config_toml,
            open_codex_dir,
            webdav_sync_codex_upload,
            webdav_sync_codex_download,
            refresh_account_token,
            import_default_account
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
