//! Baner 核心层:不依赖 Tauri,可以单独测试。
//! 模块:storage(文件布局)、crypto(端侧加密)、sync(git 同步)、secrets(本机密钥文件)、config(本机配置)。

pub mod config;
pub mod crypto;
pub mod error;
pub mod secrets;
pub mod storage;
pub mod sync;

pub use error::{Error, Result};
