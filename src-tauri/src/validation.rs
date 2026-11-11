use std::collections::{HashMap, HashSet};

use crate::models::{ValidationIssue, Workflow};
use regex::Regex;
use serde_json::Value;

const ACTION_TYPES: &[&str] = &[
    "keyboard",
    "mouse",
    "text",
    "variable",
    "wait",
    "wait_condition",
    "if",
    "else",
    "end_if",
    "loop_start",
    "loop_end",
    "break",
    "continue",
    "label",
    "jump",
    "window",
    "find_image_click",
    "comment",
];

fn validate_condition(
    condition: &Value,
    action: &crate::models::Action,
    index: usize,
    issues: &mut Vec<ValidationIssue>,
) {
    if let Some(operator) = condition.get("op").and_then(Value::as_str) {
        if operator == "not" {
            if let Some(item) = condition.get("item") {
                validate_condition(item, action, index, issues);
            }
        } else if let Some(items) = condition.get("items").and_then(Value::as_array) {
            if items.is_empty() {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "EMPTY_CONDITION",
                    "Composite condition has no items.",
                ));
            }
            for item in items {
                validate_condition(item, action, index, issues);
            }
        }
        return;
    }

    match condition.get("kind").and_then(Value::as_str).unwrap_or("") {
        "window_exists" | "window_active" => {
            let title = condition
                .pointer("/target/title")
                .and_then(Value::as_str)
                .unwrap_or("");
            let process = condition
                .pointer("/target/process")
                .and_then(Value::as_str)
                .unwrap_or("");
            if title.trim().is_empty() && process.trim().is_empty() {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "TARGET_WINDOW_MISSING",
                    "A window condition needs a title or process name.",
                ));
            }
            if condition
                .pointer("/target/titleMatch")
                .and_then(Value::as_str)
                == Some("regex")
                && !title.is_empty()
                && Regex::new(title).is_err()
            {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "INVALID_REGEX",
                    "Window title regular expression is invalid.",
                ));
            }
        }
        "image_present" | "image_absent" => {
            let asset = condition
                .get("templateAsset")
                .and_then(Value::as_str)
                .unwrap_or("");
            if asset.trim().is_empty() {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "ASSET_MISSING",
                    "An image condition needs a template asset.",
                ));
            }
            let threshold = condition
                .get("threshold")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            if !(0.1..=1.0).contains(&threshold) {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "INVALID_IMAGE_SEARCH",
                    "Image similarity must be between 0.1 and 1.",
                ));
            }
            if let Some(region) = condition.get("region") {
                let width = region.get("width").and_then(Value::as_u64).unwrap_or(0);
                let height = region.get("height").and_then(Value::as_u64).unwrap_or(0);
                if width == 0 || height == 0 {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_REGION",
                        "Image search area width and height must be at least 1 pixel.",
                    ));
                }
            }
        }
        _ => {}
    }
}

pub fn validate(workflow: &Workflow) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    if workflow.schema_version != 1 {
        issues.push(ValidationIssue {
            action_id: None,
            action_index: None,
            code: "PROJECT_SCHEMA_UNSUPPORTED".into(),
            message: format!(
                "Schema version {} is not supported.",
                workflow.schema_version
            ),
        });
    }
    if workflow.repeat_times < 1 {
        issues.push(ValidationIssue {
            action_id: None,
            action_index: None,
            code: "INVALID_REPEAT".into(),
            message: "Repeat Times must be at least 1.".into(),
        });
    }
    let mut ids = HashSet::new();
    let mut if_stack: Vec<(usize, bool)> = Vec::new();
    let mut loop_stack: Vec<usize> = Vec::new();
    let mut labels = HashMap::new();
    for (index, action) in workflow.actions.iter().enumerate() {
        if !ids.insert(&action.id) {
            issues.push(ValidationIssue::action(
                action,
                index,
                "DUPLICATE_ID",
                "Action ID is duplicated.",
            ));
        }
        if action.id.trim().is_empty() {
            issues.push(ValidationIssue::action(
                action,
                index,
                "EMPTY_ID",
                "Action ID cannot be empty.",
            ));
        }
        if action.generate == 0 {
            issues.push(ValidationIssue::action(
                action,
                index,
                "INVALID_GENERATE",
                "Generate must be at least 1.",
            ));
        }
        if !ACTION_TYPES.contains(&action.kind.as_str()) {
            issues.push(ValidationIssue::action(
                action,
                index,
                "UNKNOWN_ACTION",
                format!("Unknown action type '{}'.", action.kind),
            ));
        }
        if let Some(guard) = &action.guard {
            validate_condition(guard, action, index, &mut issues);
        }
        match action.kind.as_str() {
            "if" | "wait_condition" => {
                if let Some(condition) = action.params.get("condition") {
                    validate_condition(condition, action, index, &mut issues);
                }
            }
            "loop_start" if action.params.get("mode").and_then(Value::as_str) != Some("count") => {
                if let Some(condition) = action.params.get("condition") {
                    validate_condition(condition, action, index, &mut issues);
                }
            }
            "jump" => {
                if let Some(condition) = action.params.get("condition") {
                    validate_condition(condition, action, index, &mut issues);
                }
            }
            _ => {}
        }
        match action.kind.as_str() {
            "if" => if_stack.push((index, false)),
            "else" => match if_stack.last_mut() {
                None => issues.push(ValidationIssue::action(
                    action,
                    index,
                    "ORPHAN_ELSE",
                    "Else has no matching If.",
                )),
                Some((_, true)) => issues.push(ValidationIssue::action(
                    action,
                    index,
                    "DUPLICATE_ELSE",
                    "If block has more than one Else.",
                )),
                Some((_, has_else)) => *has_else = true,
            },
            "end_if" => {
                if if_stack.pop().is_none() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "ORPHAN_END_IF",
                        "End If has no matching If.",
                    ));
                }
            }
            "loop_start" => {
                loop_stack.push(index);
                let mode = action
                    .params
                    .get("mode")
                    .and_then(Value::as_str)
                    .unwrap_or("count");
                let count_is_valid = mode != "count"
                    || action
                        .params
                        .get("count")
                        .and_then(Value::as_u64)
                        .unwrap_or(1)
                        >= 1;
                let max_is_valid = action
                    .params
                    .get("maxIterations")
                    .and_then(Value::as_u64)
                    .unwrap_or(10_000)
                    >= 1;
                if !matches!(mode, "count" | "while" | "until") || !count_is_valid || !max_is_valid
                {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_LOOP",
                        "Loop mode must be count/while/until, and count and safety limit must be at least 1.",
                    ));
                }
            }
            "loop_end" => {
                if loop_stack.pop().is_none() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "ORPHAN_LOOP_END",
                        "End Loop has no matching Loop.",
                    ));
                }
            }
            "break" | "continue" if loop_stack.is_empty() => issues.push(ValidationIssue::action(
                action,
                index,
                "OUTSIDE_LOOP",
                "Break/Continue must be inside a loop.",
            )),
            "label" => {
                let label = action
                    .params
                    .get("label")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if label.is_empty() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "EMPTY_LABEL",
                        "Label cannot be empty.",
                    ));
                } else if labels.insert(label.to_owned(), index).is_some() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "DUPLICATE_LABEL",
                        format!("Label '{label}' is duplicated."),
                    ));
                }
            }
            "wait_condition" => {
                let poll = action
                    .params
                    .get("pollIntervalMs")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let timeout_is_valid = action
                    .params
                    .get("timeoutMs")
                    .and_then(Value::as_i64)
                    .is_some_and(|value| value >= 0);
                if poll < 50 || !timeout_is_valid {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_WAIT",
                        "Condition poll interval must be at least 50 ms and timeout non-negative.",
                    ));
                }
            }
            "mouse" if action.params.get("kind").and_then(Value::as_str) == Some("swipe") => {
                let start_x = action.params.get("startX").and_then(Value::as_i64);
                let start_y = action.params.get("startY").and_then(Value::as_i64);
                let end_x = action.params.get("endX").and_then(Value::as_i64);
                let end_y = action.params.get("endY").and_then(Value::as_i64);
                let duration = action
                    .params
                    .get("swipeDurationMs")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                if !(10..=300_000).contains(&duration)
                    || start_x.is_none()
                    || start_y.is_none()
                    || end_x.is_none()
                    || end_y.is_none()
                    || (start_x == end_x && start_y == end_y)
                {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_SWIPE",
                        "Swipe needs two different coordinates and a time between 10 and 300000 ms.",
                    ));
                }
                let direction = action
                    .params
                    .get("swipeDirection")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let direction_matches = match (direction, start_x, start_y, end_x, end_y) {
                    ("up", _, Some(sy), _, Some(ey)) => ey < sy,
                    ("down", _, Some(sy), _, Some(ey)) => ey > sy,
                    ("left", Some(sx), _, Some(ex), _) => ex < sx,
                    ("right", Some(sx), _, Some(ex), _) => ex > sx,
                    _ => false,
                };
                if !direction_matches {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "SWIPE_DIRECTION_MISMATCH",
                        format!("End coordinate does not point {direction} from Start."),
                    ));
                }
            }
            "mouse" if action.params.get("kind").and_then(Value::as_str) == Some("scroll") => {
                let direction = action
                    .params
                    .get("scrollDirection")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let steps = action
                    .params
                    .get("scrollNotches")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let interval = action
                    .params
                    .get("scrollIntervalMs")
                    .and_then(Value::as_u64)
                    .unwrap_or(u64::MAX);
                let coordinates_are_integers =
                    action.params.get("x").and_then(Value::as_i64).is_some()
                        && action.params.get("y").and_then(Value::as_i64).is_some();
                if !matches!(direction, "up" | "down")
                    || !(1..=10_000).contains(&steps)
                    || interval > 60_000
                    || !coordinates_are_integers
                {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_SCROLL",
                        "Scroll needs Up or Down, 1 to 10000 wheel steps, and a step interval from 0 to 60000 ms.",
                    ));
                }
            }
            "window" => {
                let title = action
                    .params
                    .pointer("/target/title")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let process = action
                    .params
                    .pointer("/target/process")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if title.trim().is_empty() && process.trim().is_empty() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "TARGET_WINDOW_MISSING",
                        "Window action needs a title or process name.",
                    ));
                }
                if action
                    .params
                    .pointer("/target/titleMatch")
                    .and_then(Value::as_str)
                    == Some("regex")
                    && !title.is_empty()
                    && Regex::new(title).is_err()
                {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_REGEX",
                        "Window title regular expression is invalid.",
                    ));
                }
            }
            "find_image_click" => {
                let asset = action
                    .params
                    .get("templateAsset")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if asset.is_empty() {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "ASSET_MISSING",
                        "Find Image and Click needs a template image.",
                    ));
                }
                let threshold = action
                    .params
                    .get("threshold")
                    .and_then(|value| value.as_f64())
                    .unwrap_or(0.0);
                let poll = action
                    .params
                    .get("pollIntervalMs")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let timeout_is_valid = action
                    .params
                    .get("timeoutMs")
                    .and_then(|value| value.as_i64())
                    .is_some_and(|value| value >= 0);
                if !(0.1..=1.0).contains(&threshold) || poll < 50 || !timeout_is_valid {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_IMAGE_SEARCH",
                        "Image similarity must be 0.1–1, poll interval at least 50 ms, and timeout non-negative.",
                    ));
                }
                if let Some(region) = action.params.get("region") {
                    let width = region
                        .get("width")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    let height = region
                        .get("height")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(0);
                    if width == 0 || height == 0 {
                        issues.push(ValidationIssue::action(
                            action,
                            index,
                            "INVALID_REGION",
                            "Image search area width and height must be at least 1 pixel.",
                        ));
                    }
                }
                if action
                    .params
                    .pointer("/onTimeout/mode")
                    .and_then(Value::as_str)
                    == Some("jump")
                {
                    let target_row = action
                        .params
                        .pointer("/onTimeout/targetRow")
                        .and_then(Value::as_u64)
                        .and_then(|row| usize::try_from(row).ok());
                    if !target_row
                        .is_some_and(|row| (1..=workflow.actions.len()).contains(&row))
                    {
                        issues.push(ValidationIssue::action(
                            action,
                            index,
                            "INVALID_TIMEOUT_JUMP_ROW",
                            format!(
                                "Image timeout jump row must be between 1 and {}.",
                                workflow.actions.len()
                            ),
                        ));
                    }
                }
            }
            _ => {}
        }
    }
    for (index, _) in if_stack {
        let action = &workflow.actions[index];
        issues.push(ValidationIssue::action(
            action,
            index,
            "UNCLOSED_IF",
            "If block is missing End If.",
        ));
    }
    for index in loop_stack {
        let action = &workflow.actions[index];
        issues.push(ValidationIssue::action(
            action,
            index,
            "UNCLOSED_LOOP",
            "Loop is missing End Loop.",
        ));
    }
    for (index, action) in workflow.actions.iter().enumerate() {
        if action.kind == "jump" {
            if let Some(target) = action.params.get("targetRow") {
                let valid = target
                    .as_u64()
                    .and_then(|row| usize::try_from(row).ok())
                    .is_some_and(|row| (1..=workflow.actions.len()).contains(&row));
                if !valid {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "INVALID_JUMP_ROW",
                        format!("Jump row must be between 1 and {}.", workflow.actions.len()),
                    ));
                }
            } else {
                let target = action
                    .params
                    .get("label")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                if !labels.contains_key(target) {
                    issues.push(ValidationIssue::action(
                        action,
                        index,
                        "MISSING_LABEL",
                        format!("Jump target '{target}' does not exist."),
                    ));
                }
            }
        }
        if action.kind == "wait_condition"
            && action
                .params
                .pointer("/onTimeout/mode")
                .and_then(serde_json::Value::as_str)
                == Some("jump")
        {
            let target = action
                .params
                .pointer("/onTimeout/label")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            if !labels.contains_key(target) {
                issues.push(ValidationIssue::action(
                    action,
                    index,
                    "MISSING_LABEL",
                    format!("Timeout jump target '{target}' does not exist."),
                ));
            }
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Action, Workflow};
    use serde_json::json;
    use std::collections::HashMap;

    fn action(kind: &str) -> Action {
        Action {
            id: uuid::Uuid::new_v4().to_string(),
            kind: kind.into(),
            name: kind.into(),
            enabled: true,
            delay_after_ms: 0,
            generate: 1,
            params: json!({}),
            guard: None,
            retry: None,
            failure_policy: None,
            comment: None,
            extra: HashMap::new(),
        }
    }
    fn workflow(actions: Vec<Action>) -> Workflow {
        Workflow {
            schema_version: 1,
            name: "test".into(),
            repeat_times: 1,
            actions,
            extra: HashMap::new(),
        }
    }

    #[test]
    fn rejects_unclosed_flow() {
        let issues = validate(&workflow(vec![action("if"), action("loop_start")]));
        assert!(issues.iter().any(|issue| issue.code == "UNCLOSED_IF"));
        assert!(issues.iter().any(|issue| issue.code == "UNCLOSED_LOOP"));
    }

    #[test]
    fn accepts_nested_flow() {
        assert!(validate(&workflow(vec![
            action("if"),
            action("loop_start"),
            action("loop_end"),
            action("else"),
            action("end_if")
        ]))
        .is_empty());
    }

    #[test]
    fn rejects_empty_window_target_and_invalid_image_search() {
        let mut window = action("window");
        window.params = json!({
            "operation": "activate",
            "target": { "title": "", "process": "" }
        });
        let mut image = action("find_image_click");
        image.params = json!({
            "templateAsset": "button.png",
            "threshold": 1.5,
            "pollIntervalMs": 10,
            "timeoutMs": 1000
        });
        let issues = validate(&workflow(vec![window, image]));
        assert!(issues
            .iter()
            .any(|issue| issue.code == "TARGET_WINDOW_MISSING"));
        assert!(issues
            .iter()
            .any(|issue| issue.code == "INVALID_IMAGE_SEARCH"));
    }

    #[test]
    fn validates_one_based_jump_rows() {
        let mut valid_jump = action("jump");
        valid_jump.params = json!({ "targetRow": 2 });
        assert!(validate(&workflow(vec![valid_jump, action("comment")])).is_empty());

        let mut invalid_jump = action("jump");
        invalid_jump.params = json!({ "targetRow": 3 });
        let issues = validate(&workflow(vec![invalid_jump, action("comment")]));
        assert!(issues.iter().any(|issue| issue.code == "INVALID_JUMP_ROW"));
    }

    #[test]
    fn rejects_invalid_loop_limits() {
        let mut loop_start = action("loop_start");
        loop_start.params = json!({ "mode": "count", "count": 0, "maxIterations": 0 });
        let issues = validate(&workflow(vec![loop_start, action("loop_end")]));
        assert!(issues.iter().any(|issue| issue.code == "INVALID_LOOP"));
    }

    #[test]
    fn validates_swipe_duration_coordinates_and_direction() {
        let mut swipe = action("mouse");
        swipe.params = json!({
            "kind": "swipe",
            "startX": 400,
            "startY": 700,
            "endX": 400,
            "endY": 200,
            "swipeDirection": "up",
            "swipeDurationMs": 750
        });
        assert!(validate(&workflow(vec![swipe.clone()])).is_empty());

        swipe.params["swipeDurationMs"] = json!(0);
        swipe.params["endY"] = json!(900);
        let issues = validate(&workflow(vec![swipe]));
        assert!(issues.iter().any(|issue| issue.code == "INVALID_SWIPE"));
        assert!(issues
            .iter()
            .any(|issue| issue.code == "SWIPE_DIRECTION_MISMATCH"));
    }

    #[test]
    fn validates_mouse_wheel_scrolling() {
        let mut scroll = action("mouse");
        scroll.params = json!({
            "kind": "scroll",
            "x": 320,
            "y": 240,
            "scrollDirection": "down",
            "scrollNotches": 5,
            "scrollIntervalMs": 25
        });
        assert!(validate(&workflow(vec![scroll.clone()])).is_empty());

        scroll.params["scrollNotches"] = json!(0);
        scroll.params["scrollIntervalMs"] = json!(-1);
        let issues = validate(&workflow(vec![scroll]));
        assert!(issues.iter().any(|issue| issue.code == "INVALID_SCROLL"));
    }
}
