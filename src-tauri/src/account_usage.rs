use crate::account_files::resolve_managed_account_path;
use crate::{get_accounts_dir, CodexAuthFile};
use serde::{Deserialize, Serialize};
use std::fs;

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
                }
                attempt_errors.push(format!("{} -> HTTP {}", url, status));
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
