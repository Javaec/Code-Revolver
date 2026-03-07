use crate::account_files::resolve_managed_account_path;
use crate::{get_accounts_dir, get_codex_auth_file, CodexAuthFile};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;

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

fn usage_from_api_response(api_response: ApiUsageResponse) -> Result<UsageInfo, String> {
    let map_window = |w: Option<ApiRateLimitWindow>| -> Option<RateLimitWindow> {
        w.map(|window| RateLimitWindow {
            used_percent: window.used_percent.clamp(0.0, 100.0),
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

    if primary.is_none() && secondary.is_none() {
        return Err("Usage response did not include any rate limit windows".to_string());
    }

    Ok(UsageInfo {
        primary_window: primary,
        secondary_window: secondary,
        plan_type: api_response.plan_type,
    })
}

pub(crate) async fn fetch_usage_from_auth_path(auth_path: &Path) -> Result<UsageInfo, String> {
    let content = fs::read_to_string(auth_path)
        .map_err(|e| format!("Failed to read authentication file: {}", e))?;

    let auth: CodexAuthFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse authentication file: {}", e))?;

    let access_token = &auth.tokens.access_token;
    let account_id = &auth.tokens.account_id;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Failed to build usage client: {}", e))?;
    let urls = vec![
        "https://chatgpt.com/backend-api/wham/usage",
        "https://api.openai.com/backend-api/wham/usage",
        "https://api.openai.com/api/codex/usage",
        "https://chat.openai.com/backend-api/wham/usage",
    ];

    let mut attempt_errors: Vec<String> = Vec::new();

    for url in urls {
        let mut request = client
            .get(url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .header("Cache-Control", "no-cache")
            .header("Pragma", "no-cache")
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
                if !status.is_success() {
                    attempt_errors.push(format!("{} -> HTTP {}", url, status));
                    continue;
                }

                match resp.json::<ApiUsageResponse>().await {
                    Ok(api_response) => match usage_from_api_response(api_response) {
                        Ok(usage) => return Ok(usage),
                        Err(error) => attempt_errors.push(format!("{} -> {}", url, error)),
                    },
                    Err(error) => {
                        attempt_errors.push(format!("{} -> Failed to parse API response: {}", url, error));
                    }
                }
            }
            Err(e) => {
                attempt_errors.push(format!("{} -> {}", url, e));
            }
        }
    }

    if attempt_errors.is_empty() {
        Err("All API requests failed".to_string())
    } else {
        Err(format!("All API requests failed: {}", attempt_errors.join(" | ")))
    }
}

#[tauri::command]
pub async fn fetch_usage(file_path: String) -> Result<UsageInfo, String> {
    let validated_path = resolve_managed_account_path(&file_path, &get_accounts_dir())?;
    fetch_usage_from_auth_path(&validated_path).await
}

#[tauri::command]
pub async fn fetch_active_usage() -> Result<UsageInfo, String> {
    let active_auth_path = get_codex_auth_file();
    if !active_auth_path.exists() {
        return Err("Active authentication file does not exist".to_string());
    }

    fetch_usage_from_auth_path(&active_auth_path).await
}
