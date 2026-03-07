mod account_files;
mod accounts;
mod codex_content;

use accounts::*;
use codex_content::*;
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

pub(crate) fn load_config() -> AppConfig {
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

pub(crate) fn save_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_config_file();
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn get_accounts_dir() -> PathBuf {
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

pub(crate) fn get_codex_auth_file() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".codex").join("auth.json")
}

const WEBDAV_SECRET_SERVICE: &str = "code-revolver";
const WEBDAV_SECRET_ACCOUNT: &str = "webdav";

pub(crate) fn webdav_password_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(WEBDAV_SECRET_SERVICE, WEBDAV_SECRET_ACCOUNT)
        .map_err(|e| format!("Failed to initialize secure password storage: {}", e))
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

pub(crate) fn extract_info_from_auth(auth: &CodexAuthFile) -> (String, String, Option<String>, Option<i64>) {
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
    
    let response = client
        .put(&url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Content-Type", "application/json; charset=utf-8")
        .body(content.to_string())
        .send()
        .await
        .map_err(|e| format!("Upload failed: {}", e))?;
    
    let status = response.status();
    
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
    
    let response = client
        .get(&url)
        .basic_auth(&config.username, Some(&config.password))
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    let status = response.status();
    
    if status.is_success() {
        let content = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
        Ok(content)
    } else {
        Err(format!("Download failed: HTTP {}", status))
    }
}

/// List files in WebDAV directory
async fn webdav_list(client: &reqwest::Client, config: &WebDavConfig) -> Result<Vec<String>, String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path);
    
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
    
    if !status.is_success() && status.as_u16() != 207 {
        return Err(format!("Failed to list directory: HTTP {}", status));
    }
    
    let body = response.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    
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
                
                // URL Decode
                let decoded = urlencoding::decode(href_content).unwrap_or_else(|_| href_content.into());
                
                // Extract filename
                if let Some(name) = decoded.rsplit('/').next() {
                    if name.ends_with(".json") && !name.is_empty() {
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
        result.errors.push(format!("root dir: {}", e));
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
        result.errors.push(format!("accounts dir: {}", e));
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

pub(crate) fn get_codex_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".codex")
}

pub(crate) fn get_prompts_dir() -> PathBuf {
    get_codex_dir().join("prompts")
}

pub(crate) fn get_skills_dir() -> PathBuf {
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
        result.errors.push(format!("root dir: {}", e));
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

// ========== Entry Point ==========

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
            get_webdav_password,
            set_webdav_password,
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
