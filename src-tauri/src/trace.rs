use crate::config::load_config;
use serde_json::Value;

pub fn emit(domain: &str, event: &str, fields: Value) {
    if !load_config().debug_logging {
        return;
    }

    let payload = serde_json::json!({
        "ts": chrono::Utc::now().to_rfc3339(),
        "domain": domain,
        "event": event,
        "fields": fields,
    });
    eprintln!("{}", payload);
}
