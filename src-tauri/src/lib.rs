mod account_files;
mod account_tokens;
mod account_usage;
mod accounts;
mod codex_content;
mod config;
mod desktop_shell;
mod error;
mod trace;
mod webdav_plan;
mod webdav_propfind;
mod webdav_sync;

use account_tokens::*;
use account_usage::*;
use accounts::*;
use config::*;
use codex_content::*;
use error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use webdav_sync::*;

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
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(rename = "planType")]
    pub plan_type: String,
    #[serde(rename = "subscriptionEnd")]
    pub subscription_end: Option<String>,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "authUpdatedAt")]
    pub auth_updated_at: i64,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<i64>,
    #[serde(rename = "lastRefresh")]
    pub last_refresh: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub accounts: Vec<AccountInfo>,
    #[serde(rename = "accountsDir")]
    pub accounts_dir: String,
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

pub(crate) fn get_accounts_dir() -> PathBuf {
    let config = load_config();
    if let Some(dir) = config.accounts_dir {
        let path = PathBuf::from(dir);
        if path.exists() {
            return path;
        }
    }
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".myswitch").join("accounts")
}

pub(crate) fn get_codex_auth_file() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".codex").join("auth.json")
}

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

const WEBDAV_SECRET_SERVICE: &str = "code-revolver";
const WEBDAV_SECRET_ACCOUNT: &str = "webdav";
const GATEWAY_SECRET_SERVICE: &str = "code-revolver";
const GATEWAY_SECRET_ACCOUNT: &str = "gateway-platform-key";

pub(crate) fn webdav_password_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(WEBDAV_SECRET_SERVICE, WEBDAV_SECRET_ACCOUNT)
        .map_err(|e| AppError::secure_storage(format!("Failed to initialize secure password storage: {}", e)))
}

pub(crate) fn gateway_platform_key_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(GATEWAY_SECRET_SERVICE, GATEWAY_SECRET_ACCOUNT)
        .map_err(|e| AppError::secure_storage(format!("Failed to initialize secure gateway key storage: {}", e)))
}

fn decode_jwt_payload(token: &str) -> Option<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    let payload = parts[1].replace('-', "+").replace('_', "/");
    let padding = match payload.len() % 4 {
        0 => 0,
        2 => 2,
        3 => 1,
        _ => return None,
    };
    let payload = format!("{}{}", payload, "=".repeat(padding));

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
    if let Some(payload) = decode_jwt_payload(&auth.tokens.id_token) {
        let email = payload
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let expires_at = payload.get("exp").and_then(|v| v.as_i64());
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            desktop_shell::setup_tray(app)?;
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
            set_debug_logging,
            get_webdav_password,
            set_webdav_password,
            get_gateway_platform_key,
            set_gateway_platform_key,
            set_accounts_dir,
            add_account,
            delete_account,
            read_account_content,
            update_account_content,
            webdav_sync_upload,
            webdav_sync_download,
            webdav_sync_preview,
            webdav_test_connection,
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
