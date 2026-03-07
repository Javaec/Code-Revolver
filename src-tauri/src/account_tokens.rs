use crate::account_files::resolve_managed_account_path;
use crate::{get_accounts_dir, get_codex_auth_file, CodexAuthFile};
use serde::{Deserialize, Serialize};
use std::fs;

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
