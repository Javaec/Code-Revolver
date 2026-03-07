use crate::CodexAuthFile;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ParsedAccountFile {
    pub path: PathBuf,
    pub modified_at: i64,
    pub auth: CodexAuthFile,
}

fn is_json_file(path: &PathBuf) -> bool {
    path.extension().and_then(|s| s.to_str()) == Some("json")
}

fn file_modified_at(path: &PathBuf) -> Result<i64, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read account file metadata: {}", e))?;
    metadata
        .modified()
        .map_err(|e| format!("Failed to read account file modified time: {}", e))?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to compute account file modified time: {}", e))
        .map(|duration| duration.as_millis() as i64)
}

fn parse_account_file(path: &PathBuf) -> Result<Option<ParsedAccountFile>, String> {
    if !path.is_file() || !is_json_file(path) {
        return Ok(None);
    }

    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };
    let auth = match serde_json::from_str::<CodexAuthFile>(&content) {
        Ok(auth) => auth,
        Err(_) => return Ok(None),
    };

    Ok(Some(ParsedAccountFile {
        path: path.clone(),
        modified_at: file_modified_at(path)?,
        auth,
    }))
}

pub fn collect_account_files(
    dir: &PathBuf,
    skip_path: Option<&PathBuf>,
) -> Result<Vec<ParsedAccountFile>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut parsed_files = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read accounts directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if skip_path.is_some_and(|skip| paths_match(&path, skip)) {
            continue;
        }

        if let Some(parsed) = parse_account_file(&path)? {
            parsed_files.push(parsed);
        }
    }

    Ok(parsed_files)
}

pub fn resolve_available_account_target(dir: &PathBuf, file_stem: &str) -> PathBuf {
    let safe_stem = if file_stem.trim().is_empty() {
        "account"
    } else {
        file_stem.trim()
    };
    let initial = dir.join(format!("{}.json", safe_stem));
    if !initial.exists() {
        return initial;
    }

    let mut suffix = 1;
    loop {
        let candidate = dir.join(format!("{}_{}.json", safe_stem, suffix));
        if !candidate.exists() {
            return candidate;
        }
        suffix += 1;
    }
}

pub fn files_have_same_content(left: &PathBuf, right: &PathBuf) -> bool {
    match (fs::read(left), fs::read(right)) {
        (Ok(left_bytes), Ok(right_bytes)) => left_bytes == right_bytes,
        _ => false,
    }
}

pub fn paths_match(a: &PathBuf, b: &PathBuf) -> bool {
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
        return a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy());
    }

    #[cfg(not(target_os = "windows"))]
    {
        a.to_string_lossy() == b.to_string_lossy()
    }
}

pub fn resolve_managed_account_path(file_path: &str, accounts_dir: &PathBuf) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);
    if path.extension().and_then(|s| s.to_str()) != Some("json") {
        return Err("Only .json account files are supported".to_string());
    }

    let resolved_path = fs::canonicalize(&path)
        .map_err(|e| format!("Failed to resolve account path: {}", e))?;
    let resolved_accounts_dir = if accounts_dir.exists() {
        fs::canonicalize(accounts_dir)
            .map_err(|e| format!("Failed to resolve accounts directory: {}", e))?
    } else {
        accounts_dir.clone()
    };

    if !resolved_path.starts_with(&resolved_accounts_dir) {
        return Err("Account path is outside the managed accounts directory".to_string());
    }

    Ok(resolved_path)
}
