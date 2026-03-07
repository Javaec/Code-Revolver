use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum SyncItemType {
    Account,
    Prompt,
    Skill,
    Agents,
    Config,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncItemAction {
    Upload,
    Download,
    Conflict,
    Unchanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPreviewItem {
    pub name: String,
    #[serde(rename = "type")]
    pub item_type: SyncItemType,
    pub action: SyncItemAction,
    #[serde(rename = "localTime")]
    pub local_time: Option<i64>,
    #[serde(rename = "remoteTime")]
    pub remote_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncPreview {
    pub items: Vec<SyncPreviewItem>,
    #[serde(rename = "uploadCount")]
    pub upload_count: usize,
    #[serde(rename = "downloadCount")]
    pub download_count: usize,
    #[serde(rename = "conflictCount")]
    pub conflict_count: usize,
}

#[derive(Debug, Clone)]
pub struct SyncPreviewEntry {
    pub name: String,
    pub item_type: SyncItemType,
    pub modified_at: Option<i64>,
}

const UNCHANGED_WINDOW_MS: i64 = 2_000;

pub fn build_sync_preview(
    local_entries: Vec<SyncPreviewEntry>,
    remote_entries: Vec<SyncPreviewEntry>,
) -> SyncPreview {
    let mut preview = SyncPreview::default();

    let local_map: HashMap<(SyncItemType, String), SyncPreviewEntry> = local_entries
        .into_iter()
        .map(|entry| ((entry.item_type.clone(), entry.name.clone()), entry))
        .collect();
    let remote_map: HashMap<(SyncItemType, String), SyncPreviewEntry> = remote_entries
        .into_iter()
        .map(|entry| ((entry.item_type.clone(), entry.name.clone()), entry))
        .collect();

    let keys: HashSet<(SyncItemType, String)> = local_map
        .keys()
        .cloned()
        .chain(remote_map.keys().cloned())
        .collect();

    let mut items = Vec::with_capacity(keys.len());
    for (item_type, name) in keys {
        let local = local_map.get(&(item_type.clone(), name.clone()));
        let remote = remote_map.get(&(item_type.clone(), name.clone()));
        let local_time = local.and_then(|entry| entry.modified_at);
        let remote_time = remote.and_then(|entry| entry.modified_at);

        let action = match (local, remote) {
            (Some(_), None) => SyncItemAction::Upload,
            (None, Some(_)) => SyncItemAction::Download,
            (Some(_), Some(_)) => match (local_time, remote_time) {
                (Some(left), Some(right)) if (left - right).abs() <= UNCHANGED_WINDOW_MS => SyncItemAction::Unchanged,
                (Some(_), Some(_)) => SyncItemAction::Conflict,
                _ => SyncItemAction::Conflict,
            },
            (None, None) => SyncItemAction::Unchanged,
        };

        match action {
            SyncItemAction::Upload => preview.upload_count += 1,
            SyncItemAction::Download => preview.download_count += 1,
            SyncItemAction::Conflict => preview.conflict_count += 1,
            SyncItemAction::Unchanged => {}
        }

        items.push(SyncPreviewItem {
            name,
            item_type,
            action,
            local_time,
            remote_time,
        });
    }

    items.sort_by(|a, b| {
        format!("{:?}:{}", a.item_type, a.name).cmp(&format!("{:?}:{}", b.item_type, b.name))
    });
    preview.items = items;
    preview
}

#[cfg(test)]
mod tests {
    use super::{build_sync_preview, SyncItemAction, SyncItemType, SyncPreviewEntry};

    #[test]
    fn marks_changed_files_as_conflicts_instead_of_auto_overwrite() {
        let preview = build_sync_preview(
            vec![SyncPreviewEntry {
                name: "accounts/demo.json".to_string(),
                item_type: SyncItemType::Account,
                modified_at: Some(1000),
            }],
            vec![SyncPreviewEntry {
                name: "accounts/demo.json".to_string(),
                item_type: SyncItemType::Account,
                modified_at: Some(6000),
            }],
        );

        assert_eq!(preview.conflict_count, 1);
        assert_eq!(preview.items[0].action, SyncItemAction::Conflict);
    }
}
