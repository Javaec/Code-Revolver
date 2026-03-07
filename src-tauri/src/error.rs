use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppErrorCode {
    NotFound,
    Auth,
    Forbidden,
    Io,
    Network,
    Parse,
    SecureStorage,
    External,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: AppErrorCode,
    pub message: String,
}

impl AppError {
    pub fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::NotFound, message)
    }

    pub fn auth(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Auth, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Forbidden, message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Io, message)
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Network, message)
    }

    pub fn parse(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::Parse, message)
    }

    pub fn secure_storage(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::SecureStorage, message)
    }

    pub fn external(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::External, message)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(f)
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
