use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub schema_version: u32,
    #[serde(default = "default_name")]
    pub name: String,
    pub repeat_times: u32,
    pub actions: Vec<Action>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

fn default_name() -> String {
    "Untitled".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub delay_after_ms: u64,
    #[serde(default = "one")]
    pub generate: u32,
    #[serde(default)]
    pub params: Value,
    #[serde(default)]
    pub guard: Option<Value>,
    #[serde(default)]
    pub retry: Option<RetryPolicy>,
    #[serde(default)]
    pub failure_policy: Option<FailurePolicy>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

fn enabled() -> bool {
    true
}
fn one() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    #[serde(default = "one")]
    pub max_attempts: u32,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default)]
    pub backoff: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "mode")]
pub enum FailurePolicy {
    #[default]
    Stop,
    Skip,
    Jump {
        label: String,
    },
    ContinueWarning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    Idle,
    Starting,
    Running,
    Waiting,
    Paused,
    Stopping,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_index: Option<usize>,
    pub code: String,
    pub message: String,
}

impl ValidationIssue {
    pub fn action(action: &Action, index: usize, code: &str, message: impl Into<String>) -> Self {
        Self {
            action_id: Some(action.id.clone()),
            action_index: Some(index + 1),
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStateEvent {
    pub run_id: String,
    pub state: RunState,
    pub repeat_index: u32,
    pub action_id: Option<String>,
    pub action_index: Option<usize>,
    pub message: String,
    pub elapsed_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionStateEvent {
    pub run_id: String,
    pub action_id: String,
    pub state: String,
    pub attempt: u32,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLogEntry {
    pub timestamp: String,
    pub run_id: String,
    pub action_id: Option<String>,
    pub action_index: Option<usize>,
    pub action_name: Option<String>,
    pub state: String,
    pub result: Option<String>,
    pub duration_ms: Option<u128>,
    pub retry_count: u32,
    pub error_code: Option<String>,
    pub message: Option<String>,
}
