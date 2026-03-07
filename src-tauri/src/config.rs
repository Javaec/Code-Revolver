use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const APP_CONFIG_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    #[serde(rename = "accountsDir", alias = "accounts_dir")]
    pub accounts_dir: Option<String>,
    #[serde(default, rename = "debugLogging", alias = "debug_logging")]
    pub debug_logging: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: APP_CONFIG_VERSION,
            accounts_dir: None,
            debug_logging: false,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct LegacyAppConfig {
    #[serde(default, rename = "accountsDir", alias = "accounts_dir")]
    accounts_dir: Option<String>,
    #[serde(default, rename = "debugLogging", alias = "debug_logging")]
    debug_logging: bool,
    #[serde(default)]
    version: Option<u32>,
}

pub fn get_config_file() -> PathBuf {
    let home = dirs::home_dir().expect("Failed to get home directory");
    home.join(".myswitch").join("config.json")
}

fn migrate_config(raw: &str) -> AppConfig {
    match serde_json::from_str::<AppConfig>(raw) {
        Ok(config) if config.version == APP_CONFIG_VERSION => config,
        Ok(config) => AppConfig {
            version: APP_CONFIG_VERSION,
            ..config
        },
        Err(_) => match serde_json::from_str::<LegacyAppConfig>(raw) {
            Ok(legacy) => AppConfig {
                version: legacy.version.unwrap_or(APP_CONFIG_VERSION),
                accounts_dir: legacy.accounts_dir,
                debug_logging: legacy.debug_logging,
            },
            Err(_) => AppConfig::default(),
        },
    }
}

pub fn load_config() -> AppConfig {
    let config_path = get_config_file();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            return migrate_config(&content);
        }
    }
    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> AppResult<()> {
    let config_path = get_config_file();
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::io(format!("Failed to create config directory: {}", e)))?;
    }

    let next = AppConfig {
        version: APP_CONFIG_VERSION,
        accounts_dir: config.accounts_dir.clone(),
        debug_logging: config.debug_logging,
    };
    let content = serde_json::to_string_pretty(&next)
        .map_err(|e| AppError::parse(format!("Failed to serialize config: {}", e)))?;
    fs::write(config_path, content)
        .map_err(|e| AppError::io(format!("Failed to write config: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn get_app_config() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn set_debug_logging(enabled: bool) -> AppResult<AppConfig> {
    let mut config = load_config();
    config.debug_logging = enabled;
    save_config(&config)?;
    Ok(config)
}
