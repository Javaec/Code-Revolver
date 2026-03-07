use crate::{get_codex_dir, get_prompts_dir, get_skills_dir, PromptInfo, SkillInfo};
use std::fs;
use std::path::PathBuf;

fn parse_frontmatter(content: &str) -> Option<serde_json::Value> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }

    let rest = &content[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let yaml_str = rest[..end_idx].trim();
        let mut map = serde_json::Map::new();
        for line in yaml_str.lines() {
            if let Some(colon_idx) = line.find(':') {
                let key = line[..colon_idx].trim().to_string();
                let value = line[colon_idx + 1..].trim();
                let value = value.trim_matches('"').trim_matches('\'');
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

fn resolve_path_within(base_dir: &PathBuf, path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let resolved_path = fs::canonicalize(&candidate)
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    let resolved_base = if base_dir.exists() {
        fs::canonicalize(base_dir).map_err(|e| format!("Failed to resolve base directory: {}", e))?
    } else {
        base_dir.clone()
    };

    if !resolved_path.starts_with(&resolved_base) {
        return Err("Path is outside the managed Codex directory".to_string());
    }

    Ok(resolved_path)
}

fn sanitize_leaf_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("Name contains unsupported path characters".to_string());
    }
    Ok(trimmed.to_string())
}

fn scan_prompts_recursive(dir: &PathBuf, prompts: &mut Vec<PromptInfo>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_prompts_recursive(&path, prompts);
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(content) = fs::read_to_string(&path) {
                    let frontmatter = parse_frontmatter(&content);

                    let name = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Untitled")
                        .to_string();
                    let description = frontmatter
                        .as_ref()
                        .and_then(|fm| fm.get("description"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let argument_hint = frontmatter
                        .as_ref()
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

#[tauri::command]
pub fn scan_prompts() -> Result<Vec<PromptInfo>, String> {
    let prompts_dir = get_prompts_dir();
    let mut prompts = Vec::new();

    if prompts_dir.exists() {
        scan_prompts_recursive(&prompts_dir, &mut prompts);
    }

    Ok(prompts)
}

#[tauri::command]
pub fn scan_skills() -> Result<Vec<SkillInfo>, String> {
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

            let dir_name = path
                .file_name()
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

                let name = frontmatter
                    .as_ref()
                    .and_then(|fm| fm.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(dir_name)
                    .to_string();
                let description = frontmatter
                    .as_ref()
                    .and_then(|fm| fm.get("description"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let compatibility = frontmatter
                    .as_ref()
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

#[tauri::command]
pub fn read_prompt_content(file_path: String) -> Result<String, String> {
    let path = resolve_path_within(&get_prompts_dir(), &file_path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn save_prompt_content(file_path: String, content: String) -> Result<(), String> {
    let path = resolve_path_within(&get_prompts_dir(), &file_path)?;
    fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn create_prompt(name: String, description: String, content: String) -> Result<String, String> {
    let safe_name = sanitize_leaf_name(&name)?;
    let prompts_dir = get_prompts_dir();
    if !prompts_dir.exists() {
        fs::create_dir_all(&prompts_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let file_name = format!("{}.md", safe_name);
    let file_path = prompts_dir.join(&file_name);
    if file_path.exists() {
        return Err(format!("Prompt '{}' already exists", safe_name));
    }

    let full_content = format!("---\ndescription: {}\n---\n\n{}", description, content);
    fs::write(&file_path, full_content).map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_prompt(file_path: String) -> Result<(), String> {
    let path = resolve_path_within(&get_prompts_dir(), &file_path)?;
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
pub fn read_skill_content(dir_path: String) -> Result<String, String> {
    let skill_dir = resolve_path_within(&get_skills_dir(), &dir_path)?;
    let skill_md = skill_dir.join("SKILL.md");
    fs::read_to_string(&skill_md).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn save_skill_content(dir_path: String, content: String) -> Result<(), String> {
    let skill_dir = resolve_path_within(&get_skills_dir(), &dir_path)?;
    let skill_md = skill_dir.join("SKILL.md");
    fs::write(&skill_md, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn create_skill(name: String, description: String) -> Result<String, String> {
    let safe_name = sanitize_leaf_name(&name)?;
    let skills_dir = get_skills_dir();
    let skill_dir = skills_dir.join(&safe_name);
    if skill_dir.exists() {
        return Err(format!("Skill '{}' already exists", safe_name));
    }

    fs::create_dir_all(&skill_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    let skill_md_content = format!(
        "---\nname: {}\ndescription: {}\n---\n\n# {}\n\n## When to Use\n- TODO\n\n## When NOT to Use\n- TODO\n\n## Workflow\n1. TODO\n",
        name, description, name
    );
    let skill_md = skill_dir.join("SKILL.md");
        fs::write(&skill_md, skill_md_content)
        .map_err(|e| format!("Failed to create SKILL.md: {}", e))?;

    Ok(skill_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_skill(dir_path: String) -> Result<(), String> {
    let skill_dir = resolve_path_within(&get_skills_dir(), &dir_path)?;
    fs::remove_dir_all(&skill_dir).map_err(|e| format!("Failed to delete directory: {}", e))
}

#[tauri::command]
pub fn read_agents_md() -> Result<String, String> {
    let agents_md = get_codex_dir().join("AGENTS.MD");
    if agents_md.exists() {
        fs::read_to_string(&agents_md).map_err(|e| format!("Failed to read file: {}", e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn save_agents_md(content: String) -> Result<(), String> {
    let agents_md = get_codex_dir().join("AGENTS.MD");
    fs::write(&agents_md, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn read_config_toml() -> Result<String, String> {
    let config_toml = get_codex_dir().join("config.toml");
    if config_toml.exists() {
        fs::read_to_string(&config_toml).map_err(|e| format!("Failed to read file: {}", e))
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub fn save_config_toml(content: String) -> Result<(), String> {
    let config_toml = get_codex_dir().join("config.toml");
    fs::write(&config_toml, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn open_codex_dir() -> Result<String, String> {
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
