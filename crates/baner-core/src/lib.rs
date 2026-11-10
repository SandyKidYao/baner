//! Baner 核心层:不依赖 Tauri,可以单独测试。
//! 模块:storage(文件布局)、secrets(本机密钥文件)。crypto、sync 在后续 backlog 项中加入。

pub mod config;
pub mod crypto;
pub mod error;
pub mod secrets;
pub mod storage;
pub mod sync;

pub use error::{Error, Result};
