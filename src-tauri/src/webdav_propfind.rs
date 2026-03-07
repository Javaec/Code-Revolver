use crate::error::{AppError, AppResult};
use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebDavResource {
    pub href: String,
    pub is_collection: bool,
    pub last_modified: Option<i64>,
    pub content_length: Option<u64>,
}

#[derive(Debug, Default)]
struct ResponseBuilder {
    href: Option<String>,
    is_collection: bool,
    last_modified: Option<i64>,
    content_length: Option<u64>,
}

impl ResponseBuilder {
    fn into_resource(self) -> Option<WebDavResource> {
        self.href.map(|href| WebDavResource {
            href,
            is_collection: self.is_collection,
            last_modified: self.last_modified,
            content_length: self.content_length,
        })
    }
}

fn local_name(raw: &[u8]) -> &str {
    std::str::from_utf8(raw)
        .ok()
        .and_then(|value| value.rsplit(':').next())
        .unwrap_or("")
}

fn parse_http_date(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(value)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

pub fn parse_propfind_resources(body: &str) -> AppResult<Vec<WebDavResource>> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut resources = Vec::new();
    let mut current_response: Option<ResponseBuilder> = None;
    let mut text_target: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                let name = local_name(event.name().as_ref()).to_string();
                match name.as_str() {
                    "response" => current_response = Some(ResponseBuilder::default()),
                    "collection" => {
                        if let Some(response) = current_response.as_mut() {
                            response.is_collection = true;
                        }
                    }
                    "href" | "getlastmodified" | "getcontentlength" => {
                        text_target = Some(name);
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "collection" {
                    if let Some(response) = current_response.as_mut() {
                        response.is_collection = true;
                    }
                }
            }
            Ok(Event::Text(event)) => {
                if let (Some(response), Some(target)) = (current_response.as_mut(), text_target.as_deref()) {
                    let value = event
                        .xml_content()
                        .map_err(|e| AppError::parse(format!("Failed to decode PROPFIND XML text: {}", e)))?
                        .into_owned();
                    match target {
                        "href" => response.href = Some(value),
                        "getlastmodified" => response.last_modified = parse_http_date(&value),
                        "getcontentlength" => {
                            response.content_length = value.parse::<u64>().ok();
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::End(event)) => {
                match local_name(event.name().as_ref()) {
                    "response" => {
                        if let Some(response) = current_response.take().and_then(ResponseBuilder::into_resource) {
                            resources.push(response);
                        }
                    }
                    "href" | "getlastmodified" | "getcontentlength" => {
                        text_target = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(AppError::parse(format!("Failed to parse PROPFIND XML: {}", error)));
            }
            _ => {}
        }

        buf.clear();
    }

    Ok(resources)
}

#[cfg(test)]
mod tests {
    use super::parse_propfind_resources;

    #[test]
    fn parses_files_and_directories_with_modification_time() {
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/dav/code-revolver/</d:href>
            <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
          </d:response>
          <d:response>
            <d:href>/dav/code-revolver/accounts/demo.json</d:href>
            <d:propstat>
              <d:prop>
                <d:getlastmodified>Sat, 07 Mar 2026 12:34:56 GMT</d:getlastmodified>
                <d:getcontentlength>123</d:getcontentlength>
              </d:prop>
            </d:propstat>
          </d:response>
          <d:response>
            <d:href>/dav/code-revolver/prompts/</d:href>
            <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
          </d:response>
        </d:multistatus>"#;

        let resources = parse_propfind_resources(body).expect("resources");
        assert_eq!(resources.len(), 3);
        assert_eq!(resources[1].href, "/dav/code-revolver/accounts/demo.json");
        assert!(!resources[1].is_collection);
        assert_eq!(resources[1].content_length, Some(123));
        assert!(resources[1].last_modified.is_some());
        assert!(resources[2].is_collection);
    }
}
