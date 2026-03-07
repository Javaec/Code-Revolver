use crate::error::{AppError, AppErrorCode, AppResult};
use crate::trace;
use crate::webdav_plan::{build_sync_preview, SyncItemType, SyncPreview, SyncPreviewEntry};
use crate::webdav_propfind::{parse_propfind_resources, WebDavResource};
use crate::{get_accounts_dir, get_codex_dir, get_prompts_dir, get_skills_dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

const SYNC_MANIFEST_FILE: &str = ".code-revolver-sync.json";
const SYNC_MANIFEST_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncManifest {
    version: u32,
    #[serde(rename = "generatedAt")]
    generated_at: i64,
    #[serde(default)]
    entries: HashMap<String, SyncManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SyncManifestEntry {
    hash: String,
    #[serde(rename = "modifiedAt")]
    modified_at: i64,
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

fn webdav_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::network(format!("Failed to create WebDAV client: {}", e)))
}

fn normalize_remote_path(path: &str) -> String {
    let mut normalized = path.trim().to_string();
    if !normalized.starts_with('/') {
        normalized.insert(0, '/');
    }
    if !normalized.ends_with('/') {
        normalized.push('/');
    }
    normalized
}

fn scoped_config(config: &WebDavConfig, relative_dir: &str) -> WebDavConfig {
    WebDavConfig {
        url: config.url.clone(),
        username: config.username.clone(),
        password: config.password.clone(),
        remote_path: format!(
            "{}{}/",
            normalize_remote_path(&config.remote_path),
            relative_dir.trim_matches('/'),
        ),
    }
}

fn remote_url(config: &WebDavConfig, filename: Option<&str>) -> String {
    let remote_path = normalize_remote_path(&config.remote_path);
    let base = format!("{}{}", config.url.trim_end_matches('/'), remote_path);
    match filename {
        Some(name) => format!("{}{}", base, urlencoding::encode(name)),
        None => base,
    }
}

fn http_status_error(context: &str, status: reqwest::StatusCode) -> AppError {
    match status.as_u16() {
        401 => AppError::auth(format!("{}: authentication failed", context)),
        403 => AppError::forbidden(format!("{}: access forbidden", context)),
        404 => AppError::not_found(format!("{}: resource not found", context)),
        _ => AppError::external(format!("{}: HTTP {}", context, status)),
    }
}

fn is_not_found(error: &AppError) -> bool {
    error.code == AppErrorCode::NotFound || error.message.contains("404")
}

fn path_modified_at(path: &Path) -> Option<i64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let elapsed = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(elapsed.as_millis() as i64)
}

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn hash_file(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok().map(|content| hash_content(&content))
}

fn manifest_key(prefix: &str, name: &str) -> String {
    format!("{}{}", prefix, name).trim_start_matches('/').to_string()
}

fn collect_local_tree(
    dir: &Path,
    item_type: SyncItemType,
    prefix: &str,
    entries: &mut Vec<SyncPreviewEntry>,
) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with("__") || name.starts_with('.') {
            continue;
        }

        let next_name = format!("{}{}", prefix, name);
        if path.is_dir() {
            collect_local_tree(
                &path,
                item_type.clone(),
                &format!("{}/", next_name.trim_end_matches('/')),
                entries,
            );
        } else {
            entries.push(SyncPreviewEntry {
                name: next_name,
                item_type: item_type.clone(),
                modified_at: path_modified_at(&path),
                hash: hash_file(&path),
            });
        }
    }
}

fn collect_accounts_preview_entries() -> Vec<SyncPreviewEntry> {
    let dir = get_accounts_dir();
    let mut entries = Vec::new();
    let Ok(read_dir) = fs::read_dir(dir) else {
        return entries;
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        entries.push(SyncPreviewEntry {
            name: name.to_string(),
            item_type: SyncItemType::Account,
            modified_at: path_modified_at(&path),
            hash: hash_file(&path),
        });
    }

    entries
}

fn collect_codex_preview_entries(sync_config: &CodexSyncConfig) -> Vec<SyncPreviewEntry> {
    let codex_dir = get_codex_dir();
    let mut entries = Vec::new();

    if sync_config.sync_agents_md {
        let path = codex_dir.join("AGENTS.MD");
        if path.exists() {
            entries.push(SyncPreviewEntry {
                name: "AGENTS.MD".to_string(),
                item_type: SyncItemType::Agents,
                modified_at: path_modified_at(&path),
                hash: hash_file(&path),
            });
        }
    }

    if sync_config.sync_config_toml {
        let path = codex_dir.join("config.toml");
        if path.exists() {
            entries.push(SyncPreviewEntry {
                name: "config.toml".to_string(),
                item_type: SyncItemType::Config,
                modified_at: path_modified_at(&path),
                hash: hash_file(&path),
            });
        }
    }

    if sync_config.sync_prompts {
        collect_local_tree(
            &get_prompts_dir(),
            SyncItemType::Prompt,
            "prompts/",
            &mut entries,
        );
    }

    if sync_config.sync_skills {
        collect_local_tree(
            &get_skills_dir(),
            SyncItemType::Skill,
            "skills/",
            &mut entries,
        );
    }

    entries
}

fn relative_resource_name(resource: &WebDavResource, remote_path: &str) -> Option<String> {
    let decoded = urlencoding::decode(&resource.href)
        .map(|value| value.into_owned())
        .unwrap_or_else(|_| resource.href.clone());
    let remote_base = normalize_remote_path(remote_path).trim_end_matches('/').to_string();

    if decoded.trim_end_matches('/').ends_with(&remote_base) {
        return None;
    }

    let trimmed = decoded.trim_end_matches('/');
    let leaf = trimmed.rsplit('/').next()?.trim();
    if leaf.is_empty() || leaf == SYNC_MANIFEST_FILE {
        return None;
    }

    Some(leaf.to_string())
}

async fn propfind(
    client: &reqwest::Client,
    config: &WebDavConfig,
    depth: u8,
) -> AppResult<Vec<WebDavResource>> {
    let response = client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").expect("PROPFIND"),
            remote_url(config, None),
        )
        .basic_auth(&config.username, Some(&config.password))
        .header("Depth", depth.to_string())
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Accept", "*/*")
        .body(
            r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>"#,
        )
        .send()
        .await
        .map_err(|e| AppError::network(format!("Failed to query WebDAV directory: {}", e)))?;

    let status = response.status();
    if !status.is_success() && status.as_u16() != 207 {
        return Err(http_status_error("Failed to query WebDAV directory", status));
    }

    let body = response
        .text()
        .await
        .map_err(|e| AppError::network(format!("Failed to read WebDAV response: {}", e)))?;

    parse_propfind_resources(&body)
}

async fn webdav_ensure_dir(client: &reqwest::Client, config: &WebDavConfig) -> AppResult<()> {
    let response = client
        .request(reqwest::Method::from_bytes(b"MKCOL").expect("MKCOL"), remote_url(config, None))
        .basic_auth(&config.username, Some(&config.password))
        .send()
        .await
        .map_err(|e| AppError::network(format!("Failed to create WebDAV directory: {}", e)))?;

    let status = response.status().as_u16();
    if status == 201 || status == 301 || status == 405 || response.status().is_success() {
        return Ok(());
    }

    Err(http_status_error("Failed to create WebDAV directory", response.status()))
}

async fn webdav_upload(
    client: &reqwest::Client,
    config: &WebDavConfig,
    filename: &str,
    content: &str,
) -> AppResult<()> {
    let response = client
        .put(remote_url(config, Some(filename)))
        .basic_auth(&config.username, Some(&config.password))
        .header("Content-Type", "application/json; charset=utf-8")
        .body(content.to_string())
        .send()
        .await
        .map_err(|e| AppError::network(format!("Upload failed for '{}': {}", filename, e)))?;

    if response.status().is_success() || response.status().as_u16() == 201 {
        return Ok(());
    }

    Err(http_status_error(
        &format!("Upload failed for '{}'", filename),
        response.status(),
    ))
}

async fn webdav_download(
    client: &reqwest::Client,
    config: &WebDavConfig,
    filename: &str,
) -> AppResult<String> {
    let response = client
        .get(remote_url(config, Some(filename)))
        .basic_auth(&config.username, Some(&config.password))
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| AppError::network(format!("Download failed for '{}': {}", filename, e)))?;

    if response.status().is_success() {
        return response
            .text()
            .await
            .map_err(|e| AppError::network(format!("Failed to read '{}' response: {}", filename, e)));
    }

    Err(http_status_error(
        &format!("Download failed for '{}'", filename),
        response.status(),
    ))
}

async fn list_remote_entries(
    client: &reqwest::Client,
    root_config: &WebDavConfig,
    item_type: SyncItemType,
    prefix: &str,
    manifest_prefix: &str,
    manifest: &SyncManifest,
) -> AppResult<Vec<SyncPreviewEntry>> {
    let mut stack = vec![(root_config.clone(), prefix.to_string(), manifest_prefix.to_string())];
    let mut entries = Vec::new();

    while let Some((config, current_prefix, current_manifest_prefix)) = stack.pop() {
        let resources = match propfind(client, &config, 1).await {
            Ok(value) => value,
            Err(error) if is_not_found(&error) => continue,
            Err(error) => return Err(error),
        };

        for resource in resources {
            let Some(name) = relative_resource_name(&resource, &config.remote_path) else {
                continue;
            };

            if resource.is_collection {
                stack.push((
                    scoped_config(&config, &name),
                    format!("{}/", format!("{}{}", current_prefix, name).trim_end_matches('/')),
                    format!("{}/", manifest_key(&current_manifest_prefix, &name).trim_end_matches('/')),
                ));
                continue;
            }

            entries.push(SyncPreviewEntry {
                name: format!("{}{}", current_prefix, name),
                item_type: item_type.clone(),
                modified_at: resource.last_modified,
                hash: manifest
                    .entries
                    .get(&manifest_key(&current_manifest_prefix, &name))
                    .map(|entry| entry.hash.clone()),
            });
        }
    }

    Ok(entries)
}

async fn list_remote_root_files(client: &reqwest::Client, config: &WebDavConfig) -> AppResult<Vec<WebDavResource>> {
    propfind(client, config, 1).await
}

async fn load_sync_manifest(client: &reqwest::Client, config: &WebDavConfig) -> AppResult<SyncManifest> {
    match webdav_download(client, config, SYNC_MANIFEST_FILE).await {
        Ok(content) => serde_json::from_str::<SyncManifest>(&content)
            .map_err(|e| AppError::parse(format!("Failed to parse sync manifest: {}", e))),
        Err(error) if is_not_found(&error) => Ok(SyncManifest {
            version: SYNC_MANIFEST_VERSION,
            generated_at: chrono::Utc::now().timestamp_millis(),
            entries: HashMap::new(),
        }),
        Err(error) => Err(error),
    }
}

async fn write_sync_manifest(
    client: &reqwest::Client,
    config: &WebDavConfig,
    manifest: &SyncManifest,
) -> AppResult<()> {
    let body = serde_json::to_string_pretty(manifest)
        .map_err(|e| AppError::parse(format!("Failed to serialize sync manifest: {}", e)))?;
    webdav_upload(client, config, SYNC_MANIFEST_FILE, &body).await
}

fn upsert_manifest_entry(manifest: &mut SyncManifest, key: String, hash: String, modified_at: i64) {
    manifest.version = SYNC_MANIFEST_VERSION;
    manifest.generated_at = chrono::Utc::now().timestamp_millis();
    manifest.entries.insert(key, SyncManifestEntry { hash, modified_at });
}

async fn upload_dir_recursive(
    client: &reqwest::Client,
    config: &WebDavConfig,
    dir: &Path,
    manifest_prefix: &str,
    manifest: &mut SyncManifest,
    result: &mut SyncResult,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with("__") || name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let nested_config = scoped_config(config, name);
            if let Err(error) = webdav_ensure_dir(client, &nested_config).await {
                result.errors.push(format!("{}: {}", nested_config.remote_path, error));
                continue;
            }
            let nested_prefix = format!("{}/", manifest_key(manifest_prefix, name).trim_end_matches('/'));
            Box::pin(upload_dir_recursive(client, &nested_config, &path, &nested_prefix, manifest, result)).await;
            continue;
        }

        match fs::read_to_string(&path) {
            Ok(content) => {
                let content_hash = hash_content(&content);
                let key = manifest_key(manifest_prefix, name);
                if manifest.entries.get(&key).is_some_and(|entry| entry.hash == content_hash) {
                    continue;
                }
                match webdav_upload(client, config, name, &content).await {
                    Ok(()) => {
                        result.uploaded.push(format!("{}{}", config.remote_path, name));
                        upsert_manifest_entry(
                            manifest,
                            key,
                            content_hash,
                            path_modified_at(&path).unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
                        );
                    }
                    Err(error) => result.errors.push(format!("{}: {}", name, error)),
                }
            }
            Err(error) => result
                .errors
                .push(format!("{}: Failed to read file: {}", path.to_string_lossy(), error)),
        }
    }
}

async fn download_dir_recursive(
    client: &reqwest::Client,
    config: &WebDavConfig,
    local_dir: &Path,
    manifest_prefix: &str,
    manifest: &SyncManifest,
    result: &mut SyncResult,
) {
    let resources = match propfind(client, config, 1).await {
        Ok(value) => value,
        Err(error) if is_not_found(&error) => return,
        Err(error) => {
            result.errors.push(error.message);
            return;
        }
    };

    for resource in resources {
        let Some(name) = relative_resource_name(&resource, &config.remote_path) else {
            continue;
        };

        if resource.is_collection {
            let nested_local = local_dir.join(&name);
            if let Err(error) = fs::create_dir_all(&nested_local) {
                result
                    .errors
                    .push(format!("{}: Failed to create local directory: {}", nested_local.to_string_lossy(), error));
                continue;
            }
            let nested_config = scoped_config(config, &name);
            let nested_prefix = format!("{}/", manifest_key(manifest_prefix, &name).trim_end_matches('/'));
            Box::pin(download_dir_recursive(client, &nested_config, &nested_local, &nested_prefix, manifest, result)).await;
            continue;
        }

        match webdav_download(client, config, &name).await {
            Ok(content) => {
                let target = local_dir.join(&name);
                let key = manifest_key(manifest_prefix, &name);
                let content_hash = hash_content(&content);
                if manifest.entries.get(&key).is_some_and(|entry| entry.hash == content_hash)
                    && target.exists()
                    && hash_file(&target).as_deref() == Some(content_hash.as_str())
                {
                    continue;
                }
                match fs::write(&target, &content) {
                    Ok(()) => result.downloaded.push(format!("{}{}", config.remote_path, name)),
                    Err(error) => result
                        .errors
                        .push(format!("{}: Failed to write file: {}", target.to_string_lossy(), error)),
                }
            }
            Err(error) => result.errors.push(format!("{}: {}", name, error)),
        }
    }
}

#[tauri::command]
pub async fn webdav_sync_preview(
    config: WebDavConfig,
    sync_config: CodexSyncConfig,
    sync_accounts: bool,
) -> AppResult<SyncPreview> {
    let client = webdav_client()?;
    let mut local_entries = collect_codex_preview_entries(&sync_config);
    let mut remote_entries = Vec::new();
    let manifest = load_sync_manifest(&client, &config).await?;

    if sync_accounts {
        local_entries.extend(collect_accounts_preview_entries());
        remote_entries.extend(
            list_remote_entries(
                &client,
                &scoped_config(&config, "accounts"),
                SyncItemType::Account,
                "",
                "accounts/",
                &manifest,
            ).await?,
        );
    }

    if sync_config.sync_prompts {
        remote_entries.extend(
            list_remote_entries(
                &client,
                &scoped_config(&config, "prompts"),
                SyncItemType::Prompt,
                "prompts/",
                "prompts/",
                &manifest,
            )
                .await?,
        );
    }

    if sync_config.sync_skills {
        remote_entries.extend(
            list_remote_entries(
                &client,
                &scoped_config(&config, "skills"),
                SyncItemType::Skill,
                "skills/",
                "skills/",
                &manifest,
            )
                .await?,
        );
    }

    if sync_config.sync_agents_md || sync_config.sync_config_toml {
        for resource in list_remote_root_files(&client, &config).await? {
            let Some(name) = relative_resource_name(&resource, &config.remote_path) else {
                continue;
            };

            if sync_config.sync_agents_md && name == "AGENTS.MD" {
                remote_entries.push(SyncPreviewEntry {
                    name,
                    item_type: SyncItemType::Agents,
                    modified_at: resource.last_modified,
                    hash: manifest.entries.get("AGENTS.MD").map(|entry| entry.hash.clone()),
                });
            } else if sync_config.sync_config_toml && name == "config.toml" {
                remote_entries.push(SyncPreviewEntry {
                    name,
                    item_type: SyncItemType::Config,
                    modified_at: resource.last_modified,
                    hash: manifest.entries.get("config.toml").map(|entry| entry.hash.clone()),
                });
            }
        }
    }

    let preview = build_sync_preview(local_entries, remote_entries);
    trace::emit(
        "webdav",
        "preview",
        json!({
            "uploadCount": preview.upload_count,
            "downloadCount": preview.download_count,
            "conflictCount": preview.conflict_count,
        }),
    );
    Ok(preview)
}

#[tauri::command]
pub async fn webdav_sync_upload(config: WebDavConfig) -> AppResult<SyncResult> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();
    let accounts_config = scoped_config(&config, "accounts");
    let mut manifest = load_sync_manifest(&client, &config).await?;

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if let Err(error) = webdav_ensure_dir(&client, &config).await {
        result.errors.push(format!("root dir: {}", error));
    }
    if let Err(error) = webdav_ensure_dir(&client, &accounts_config).await {
        result.errors.push(format!("accounts dir: {}", error));
    }

    if let Ok(entries) = fs::read_dir(&accounts_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }

            let Some(filename) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };

            match fs::read_to_string(&path) {
                Ok(content) => {
                    let content_hash = hash_content(&content);
                    let key = manifest_key("accounts/", filename);
                    if manifest.entries.get(&key).is_some_and(|entry| entry.hash == content_hash) {
                        continue;
                    }
                    match webdav_upload(&client, &accounts_config, filename, &content).await {
                        Ok(()) => {
                            result.uploaded.push(filename.to_string());
                            upsert_manifest_entry(
                                &mut manifest,
                                key,
                                content_hash,
                                path_modified_at(&path).unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
                            );
                        }
                        Err(error) => result.errors.push(format!("{}: {}", filename, error)),
                    }
                }
                Err(error) => result.errors.push(format!("{}: Failed to read file: {}", filename, error)),
            }
        }
    }

    let _ = write_sync_manifest(&client, &config, &manifest).await;
    trace::emit(
        "webdav",
        "sync_accounts_upload",
        json!({
            "uploaded": result.uploaded.len(),
            "errors": result.errors.len(),
        }),
    );
    Ok(result)
}

#[tauri::command]
pub async fn webdav_sync_download(config: WebDavConfig) -> AppResult<SyncResult> {
    let client = webdav_client()?;
    let accounts_dir = get_accounts_dir();
    let accounts_config = scoped_config(&config, "accounts");
    let manifest = load_sync_manifest(&client, &config).await?;

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if !accounts_dir.exists() {
        fs::create_dir_all(&accounts_dir)
            .map_err(|e| AppError::io(format!("Failed to create local accounts directory: {}", e)))?;
    }

    let resources = match propfind(&client, &accounts_config, 1).await {
        Ok(value) => value,
        Err(error) if is_not_found(&error) => Vec::new(),
        Err(error) => return Err(error),
    };

    for resource in resources {
        let Some(filename) = relative_resource_name(&resource, &accounts_config.remote_path) else {
            continue;
        };
        if resource.is_collection {
            continue;
        }

        match webdav_download(&client, &accounts_config, &filename).await {
            Ok(content) => {
                if serde_json::from_str::<serde_json::Value>(&content).is_err() {
                    result.errors.push(format!("{}: Invalid JSON", filename));
                    continue;
                }
                let target = accounts_dir.join(&filename);
                let key = manifest_key("accounts/", &filename);
                let content_hash = hash_content(&content);
                if manifest.entries.get(&key).is_some_and(|entry| entry.hash == content_hash)
                    && target.exists()
                    && hash_file(&target).as_deref() == Some(content_hash.as_str())
                {
                    continue;
                }
                match fs::write(&target, &content) {
                    Ok(()) => result.downloaded.push(filename),
                    Err(error) => result.errors.push(format!("{}: Failed to write file: {}", target.to_string_lossy(), error)),
                }
            }
            Err(error) => result.errors.push(format!("{}: {}", filename, error)),
        }
    }

    trace::emit(
        "webdav",
        "sync_accounts_download",
        json!({
            "downloaded": result.downloaded.len(),
            "errors": result.errors.len(),
        }),
    );
    Ok(result)
}

#[tauri::command]
pub async fn webdav_test_connection(config: WebDavConfig) -> AppResult<String> {
    let client = webdav_client()?;
    let response = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").expect("PROPFIND"), remote_url(&config, None))
        .basic_auth(&config.username, Some(&config.password))
        .header("Depth", "0")
        .send()
        .await
        .map_err(|e| AppError::network(format!("Connection failed: {}", e)))?;

    let status = response.status();
    if status.is_success() || status.as_u16() == 207 {
        return Ok("Connection successful".to_string());
    }
    if status.as_u16() == 404 {
        webdav_ensure_dir(&client, &config).await?;
        return Ok("Connection successful, remote directory created".to_string());
    }
    if status.as_u16() == 401 {
        return Err(AppError::auth(
            "Authentication failed: Please check username and application password",
        ));
    }

    Err(http_status_error("Connection failed", status))
}

#[tauri::command]
pub async fn webdav_sync_codex_upload(
    config: WebDavConfig,
    sync_config: CodexSyncConfig,
) -> AppResult<SyncResult> {
    let client = webdav_client()?;
    let codex_dir = get_codex_dir();
    let mut manifest = load_sync_manifest(&client, &config).await?;

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if let Err(error) = webdav_ensure_dir(&client, &config).await {
        result.errors.push(format!("root dir: {}", error));
    }

    if sync_config.sync_agents_md {
        let agents_md = codex_dir.join("AGENTS.MD");
        if agents_md.exists() {
            match fs::read_to_string(&agents_md) {
                Ok(content) => {
                    let content_hash = hash_content(&content);
                    if manifest.entries.get("AGENTS.MD").is_none_or(|entry| entry.hash != content_hash) {
                        match webdav_upload(&client, &config, "AGENTS.MD", &content).await {
                            Ok(()) => {
                                result.uploaded.push("AGENTS.MD".to_string());
                                upsert_manifest_entry(
                                    &mut manifest,
                                    "AGENTS.MD".to_string(),
                                    content_hash,
                                    path_modified_at(&agents_md).unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
                                );
                            }
                            Err(error) => result.errors.push(format!("AGENTS.MD: {}", error)),
                        }
                    }
                }
                Err(error) => result.errors.push(format!("AGENTS.MD: Failed to read file: {}", error)),
            }
        }
    }

    if sync_config.sync_config_toml {
        let config_toml = codex_dir.join("config.toml");
        if config_toml.exists() {
            match fs::read_to_string(&config_toml) {
                Ok(content) => {
                    let content_hash = hash_content(&content);
                    if manifest.entries.get("config.toml").is_none_or(|entry| entry.hash != content_hash) {
                        match webdav_upload(&client, &config, "config.toml", &content).await {
                            Ok(()) => {
                                result.uploaded.push("config.toml".to_string());
                                upsert_manifest_entry(
                                    &mut manifest,
                                    "config.toml".to_string(),
                                    content_hash,
                                    path_modified_at(&config_toml).unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
                                );
                            }
                            Err(error) => result.errors.push(format!("config.toml: {}", error)),
                        }
                    }
                }
                Err(error) => result.errors.push(format!("config.toml: Failed to read file: {}", error)),
            }
        }
    }

    if sync_config.sync_prompts {
        let prompts_config = scoped_config(&config, "prompts");
        if let Err(error) = webdav_ensure_dir(&client, &prompts_config).await {
            result.errors.push(format!("prompts dir: {}", error));
        } else {
            upload_dir_recursive(&client, &prompts_config, &get_prompts_dir(), "prompts/", &mut manifest, &mut result).await;
        }
    }

    if sync_config.sync_skills {
        let skills_config = scoped_config(&config, "skills");
        if let Err(error) = webdav_ensure_dir(&client, &skills_config).await {
            result.errors.push(format!("skills dir: {}", error));
        } else {
            upload_dir_recursive(&client, &skills_config, &get_skills_dir(), "skills/", &mut manifest, &mut result).await;
        }
    }

    let _ = write_sync_manifest(&client, &config, &manifest).await;
    trace::emit(
        "webdav",
        "sync_codex_upload",
        json!({
            "uploaded": result.uploaded.len(),
            "errors": result.errors.len(),
        }),
    );
    Ok(result)
}

#[tauri::command]
pub async fn webdav_sync_codex_download(
    config: WebDavConfig,
    sync_config: CodexSyncConfig,
) -> AppResult<SyncResult> {
    let client = webdav_client()?;
    let codex_dir = get_codex_dir();
    let manifest = load_sync_manifest(&client, &config).await?;

    let mut result = SyncResult {
        uploaded: Vec::new(),
        downloaded: Vec::new(),
        errors: Vec::new(),
    };

    if sync_config.sync_agents_md {
        match webdav_download(&client, &config, "AGENTS.MD").await {
            Ok(content) => {
                let target = codex_dir.join("AGENTS.MD");
                let content_hash = hash_content(&content);
                if !(manifest.entries.get("AGENTS.MD").is_some_and(|entry| entry.hash == content_hash)
                    && target.exists()
                    && hash_file(&target).as_deref() == Some(content_hash.as_str()))
                {
                    match fs::write(&target, &content) {
                        Ok(()) => result.downloaded.push("AGENTS.MD".to_string()),
                        Err(error) => result.errors.push(format!("AGENTS.MD: Failed to write file: {}", error)),
                    }
                }
            }
            Err(error) if is_not_found(&error) => {}
            Err(error) => result.errors.push(format!("AGENTS.MD: {}", error)),
        }
    }

    if sync_config.sync_config_toml {
        match webdav_download(&client, &config, "config.toml").await {
            Ok(content) => {
                let target = codex_dir.join("config.toml");
                let content_hash = hash_content(&content);
                if !(manifest.entries.get("config.toml").is_some_and(|entry| entry.hash == content_hash)
                    && target.exists()
                    && hash_file(&target).as_deref() == Some(content_hash.as_str()))
                {
                    match fs::write(&target, &content) {
                        Ok(()) => result.downloaded.push("config.toml".to_string()),
                        Err(error) => result.errors.push(format!("config.toml: Failed to write file: {}", error)),
                    }
                }
            }
            Err(error) if is_not_found(&error) => {}
            Err(error) => result.errors.push(format!("config.toml: {}", error)),
        }
    }

    if sync_config.sync_prompts {
        let prompts_dir = get_prompts_dir();
        let _ = fs::create_dir_all(&prompts_dir);
        download_dir_recursive(
            &client,
            &scoped_config(&config, "prompts"),
            &prompts_dir,
            "prompts/",
            &manifest,
            &mut result,
        ).await;
    }

    if sync_config.sync_skills {
        let skills_dir = get_skills_dir();
        let _ = fs::create_dir_all(&skills_dir);
        download_dir_recursive(
            &client,
            &scoped_config(&config, "skills"),
            &skills_dir,
            "skills/",
            &manifest,
            &mut result,
        ).await;
    }

    trace::emit(
        "webdav",
        "sync_codex_download",
        json!({
            "downloaded": result.downloaded.len(),
            "errors": result.errors.len(),
        }),
    );
    Ok(result)
}
