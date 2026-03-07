use crate::{get_accounts_dir, get_codex_dir, get_prompts_dir, get_skills_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

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

fn webdav_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create WebDAV client: {}", e))
}

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

async fn webdav_upload(client: &reqwest::Client, config: &WebDavConfig, filename: &str, content: &str) -> Result<(), String> {
    let remote_path = normalize_remote_path(&config.remote_path);
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

async fn webdav_download(client: &reqwest::Client, config: &WebDavConfig, filename: &str) -> Result<String, String> {
    let remote_path = normalize_remote_path(&config.remote_path);
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
        response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        Err(format!("Download failed: HTTP {}", status))
    }
}

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

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut files = Vec::new();
    let href_patterns = ["<d:href>", "<D:href>", "<href>"];
    let href_end_patterns = ["</d:href>", "</D:href>", "</href>"];

    for (start_pat, end_pat) in href_patterns.iter().zip(href_end_patterns.iter()) {
        let mut search_pos = 0;
        while let Some(start_idx) = body[search_pos..].find(start_pat) {
            let abs_start = search_pos + start_idx + start_pat.len();
            if let Some(end_idx) = body[abs_start..].find(end_pat) {
                let href_content = &body[abs_start..abs_start + end_idx];
                let decoded = urlencoding::decode(href_content).unwrap_or_else(|_| href_content.into());
                if let Some(name) = decoded.rsplit('/').next() {
                    if name.ends_with(".json") && !name.is_empty() {
                        let file_name = name.to_string();
                        if !files.contains(&file_name) {
                            files.push(file_name);
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

async fn webdav_ensure_dir(client: &reqwest::Client, config: &WebDavConfig) -> Result<(), String> {
    let remote_path = normalize_remote_path(&config.remote_path);
    let url = format!("{}{}", config.url.trim_end_matches('/'), remote_path.trim_end_matches('/'));

    let response = client
        .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
        .basic_auth(&config.username, Some(&config.password))
        .send()
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let status = response.status().as_u16();
    if status == 201 || status == 405 || status == 301 || response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to create directory: HTTP {}", response.status()))
    }
}

#[tauri::command]
pub async fn webdav_sync_upload(config: WebDavConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if let Err(e) = webdav_ensure_dir(&client, &config).await {
        result.errors.push(format!("root dir: {}", e));
    }

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

    if let Ok(entries) = fs::read_dir(&accounts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    match fs::read_to_string(&path) {
                        Ok(content) => match webdav_upload(&client, &accounts_config, filename, &content).await {
                            Ok(_) => result.uploaded.push(filename.to_string()),
                            Err(e) => result.errors.push(format!("{}: {}", filename, e)),
                        },
                        Err(e) => result.errors.push(format!("{}: Read failed {}", filename, e)),
                    }
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn webdav_sync_download(config: WebDavConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir).map_err(|e| format!("Failed to create local directory: {}", e))?;
    }

    let accounts_remote_path = format!("{}accounts/", config.remote_path.trim_end_matches('/'));
    let accounts_config = WebDavConfig {
        url: config.url.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        remote_path: accounts_remote_path,
    };

    let remote_files = webdav_list(&client, &accounts_config).await?;
    for filename in remote_files {
        match webdav_download(&client, &accounts_config, &filename).await {
            Ok(content) => {
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

#[tauri::command]
pub async fn webdav_test_connection(config: WebDavConfig) -> Result<String, String> {
    let client = webdav_client()?;
    let remote_path = normalize_remote_path(&config.remote_path);
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
        webdav_ensure_dir(&client, &config).await?;
        Ok("Connection successful, remote directory created".to_string())
    } else if status.as_u16() == 401 {
        Err("Authentication failed: Please check username and application password".to_string())
    } else {
        Err(format!("Connection failed: HTTP {}", status))
    }
}

#[tauri::command]
pub async fn webdav_sync_codex_upload(config: WebDavConfig, sync_config: CodexSyncConfig) -> Result<SyncResult, String> {
    let client = webdav_client()?;
    let codex_dir = get_codex_dir();

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if let Err(e) = webdav_ensure_dir(&client, &config).await {
        result.errors.push(format!("root dir: {}", e));
    }

    let base_path = config.remote_path.trim_end_matches('/');

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
            if let Ok(entries) = fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let dir_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
                    if dir_name.starts_with('.') || dir_name == "dist" {
                        continue;
                    }

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

async fn upload_dir_recursive(client: &reqwest::Client, config: &WebDavConfig, dir: &PathBuf, result: &mut SyncResult) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

            if name.starts_with("__") || name.starts_with('.') {
                continue;
            }

            if path.is_dir() {
                let sub_remote = format!("{}{}/", config.remote_path, name);
                let sub_config = WebDavConfig {
                    url: config.url.clone(),
                    username: config.username.clone(),
                    password: config.password.clone(),
                    remote_path: sub_remote,
                };
                let _ = webdav_ensure_dir(client, &sub_config).await;
                Box::pin(upload_dir_recursive(client, &sub_config, &path, result)).await;
            } else if let Ok(content) = fs::read_to_string(&path) {
                match webdav_upload(client, config, name, &content).await {
                    Ok(_) => result.uploaded.push(format!("{}{}", config.remote_path, name)),
                    Err(e) => result.errors.push(format!("{}: {}", name, e)),
                }
            }
        }
    }
}

#[tauri::command]
pub async fn webdav_sync_codex_download(config: WebDavConfig, sync_config: CodexSyncConfig) -> Result<SyncResult, String> {
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

async fn download_dir_recursive(client: &reqwest::Client, config: &WebDavConfig, local_dir: &PathBuf, result: &mut SyncResult) {
    match webdav_list_all(client, config).await {
        Ok(items) => {
            for item in items {
                if item.ends_with('/') {
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

                if first {
                    first = false;
                    search_pos = abs_start + end_idx;
                    continue;
                }

                let name = decoded.trim_end_matches('/').rsplit('/').next().unwrap_or("");
                if !name.is_empty() && !name.starts_with('.') {
                    let check_range = &body[abs_start..body.len().min(abs_start + 500)];
                    let is_dir = check_range.contains("<d:collection")
                        || check_range.contains("<D:collection")
                        || check_range.contains("<collection");

                    let item_name = if is_dir || decoded.ends_with('/') {
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
