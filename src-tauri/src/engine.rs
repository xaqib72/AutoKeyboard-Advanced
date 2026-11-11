use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use async_recursion::async_recursion;
use chrono::Utc;
use regex::Regex;
use serde_json::{json, Number, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::{
    error::{AppError, AppResult},
    models::{
        Action, ActionStateEvent, FailurePolicy, RunLogEntry, RunState, RunStateEvent, Workflow,
    },
    native::{self, NativeInput},
    vision::{MatchResult, VisionWorker},
};

pub struct RunControl {
    pub run_id: String,
    cancelled: AtomicBool,
    paused: AtomicBool,
    wake: Notify,
}

impl RunControl {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            cancelled: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            wake: Notify::new(),
        })
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.wake.notify_waiters();
    }
    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }
    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.wake.notify_waiters();
    }
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }
    fn check(&self) -> AppResult<()> {
        if self.is_cancelled() {
            Err(AppError::coded("RUN_CANCELLED", "Workflow was stopped."))
        } else {
            Ok(())
        }
    }
    async fn wait_ready(&self) -> AppResult<()> {
        self.check()?;
        while self.is_paused() {
            self.wake.notified().await;
            self.check()?;
        }
        Ok(())
    }
    async fn sleep(&self, milliseconds: u64) -> AppResult<()> {
        let mut remaining = milliseconds;
        while remaining > 0 {
            self.wait_ready().await?;
            let slice = remaining.min(25);
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(slice)) => remaining -= slice,
                _ = self.wake.notified() => {}
            }
        }
        self.check()
    }
}

#[derive(Default)]
struct FlowMap {
    if_false: HashMap<usize, usize>,
    else_end: HashMap<usize, usize>,
    loop_end: HashMap<usize, usize>,
    loop_start: HashMap<usize, usize>,
    enclosing_loop: HashMap<usize, (usize, usize)>,
    labels: HashMap<String, usize>,
}

#[derive(Default)]
struct RuntimeData {
    variables: HashMap<String, Value>,
    loop_iterations: HashMap<usize, u64>,
    last_match: Option<MatchResult>,
}

#[derive(Debug)]
enum ExecOutcome {
    Next,
    Jump(usize),
}

pub async fn execute(
    app: AppHandle,
    workflow: Workflow,
    control: Arc<RunControl>,
    input: Arc<NativeInput>,
    vision: Arc<VisionWorker>,
) -> AppResult<()> {
    let started = Instant::now();
    let flow = compile_flow(&workflow)?;
    emit_run(
        &app,
        &control,
        RunState::Starting,
        0,
        None,
        None,
        "Preparing workflow",
        started,
    );
    let result = execute_inner(&app, &workflow, &flow, &control, &input, &vision, started).await;
    input.release_all();
    let (state, message) = match &result {
        Ok(()) => (RunState::Completed, "Workflow completed".to_owned()),
        Err(error) if error.to_string().starts_with("RUN_CANCELLED") => {
            (RunState::Cancelled, "Workflow stopped".to_owned())
        }
        Err(error) => (RunState::Failed, error.to_string()),
    };
    emit_run(
        &app,
        &control,
        state,
        workflow.repeat_times,
        None,
        None,
        &message,
        started,
    );
    result
}

async fn execute_inner(
    app: &AppHandle,
    workflow: &Workflow,
    flow: &FlowMap,
    control: &RunControl,
    input: &NativeInput,
    vision: &VisionWorker,
    started: Instant,
) -> AppResult<()> {
    let mut data = RuntimeData::default();
    for repeat_index in 1..=workflow.repeat_times {
        let mut pointer = 0usize;
        data.loop_iterations.clear();
        while pointer < workflow.actions.len() {
            control.wait_ready().await?;
            let action = &workflow.actions[pointer];
            if !action.enabled {
                pointer += 1;
                continue;
            }
            emit_run(
                app,
                control,
                RunState::Running,
                repeat_index,
                Some(&action.id),
                Some(pointer + 1),
                &format!("Running {}", action.name),
                started,
            );
            if let Some(guard) = &action.guard {
                if !evaluate_condition(guard, &mut data, vision).await?.matched {
                    pointer += 1;
                    continue;
                }
            }
            let action_started = Instant::now();
            emit_action(app, control, action, "running", 1, None);
            let flow_outcome = execute_flow_action(
                app,
                workflow,
                flow,
                control,
                input,
                vision,
                &mut data,
                pointer,
                repeat_index,
                started,
            )
            .await;
            let outcome = match flow_outcome {
                Ok(outcome) => outcome,
                Err(error) => {
                    match apply_retry_and_policy(
                        app,
                        action,
                        control,
                        input,
                        vision,
                        &mut data,
                        &flow.labels,
                        &error,
                    )
                    .await
                    {
                        Ok(outcome) => outcome,
                        Err(final_error) => {
                            let duration = action_started.elapsed().as_millis();
                            emit_action(
                                app,
                                control,
                                action,
                                "failed",
                                1,
                                Some(&final_error.to_string()),
                            );
                            emit_log(
                                app,
                                control,
                                action,
                                pointer + 1,
                                "failed",
                                duration,
                                Some(&final_error),
                                0,
                            );
                            return Err(final_error);
                        }
                    }
                }
            };
            let duration = action_started.elapsed().as_millis();
            emit_action(app, control, action, "completed", 1, None);
            emit_log(
                app,
                control,
                action,
                pointer + 1,
                "completed",
                duration,
                None,
                0,
            );
            if action.delay_after_ms > 0 {
                control.sleep(action.delay_after_ms).await?;
            }
            pointer = match outcome {
                ExecOutcome::Next => pointer + 1,
                ExecOutcome::Jump(target) => target,
            };
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn execute_flow_action(
    app: &AppHandle,
    workflow: &Workflow,
    flow: &FlowMap,
    control: &RunControl,
    input: &NativeInput,
    vision: &VisionWorker,
    data: &mut RuntimeData,
    pointer: usize,
    repeat_index: u32,
    started: Instant,
) -> AppResult<ExecOutcome> {
    let action = &workflow.actions[pointer];
    match action.kind.as_str() {
        "if" => {
            let matched = evaluate_condition(
                action.params.get("condition").unwrap_or(&Value::Null),
                data,
                vision,
            )
            .await?
            .matched;
            Ok(if matched {
                ExecOutcome::Next
            } else {
                ExecOutcome::Jump(*flow.if_false.get(&pointer).ok_or_else(|| {
                    AppError::coded("VALIDATION_ERROR", "If jump target is missing.")
                })?)
            })
        }
        "else" => Ok(ExecOutcome::Jump(*flow.else_end.get(&pointer).ok_or_else(
            || AppError::coded("VALIDATION_ERROR", "Else jump target is missing."),
        )?)),
        "end_if" | "label" | "comment" => Ok(ExecOutcome::Next),
        "jump" => {
            if let Some(condition) = action.params.get("condition") {
                if !condition.is_null()
                    && !evaluate_condition(condition, data, vision).await?.matched
                {
                    return Ok(ExecOutcome::Next);
                }
            }
            Ok(ExecOutcome::Jump(resolve_jump_target(
                action,
                flow,
                workflow.actions.len(),
            )?))
        }
        "loop_start" => {
            let end = *flow.loop_end.get(&pointer).ok_or_else(|| {
                AppError::coded("VALIDATION_ERROR", "Loop end target is missing.")
            })?;
            let iteration = *data.loop_iterations.entry(pointer).or_insert(0);
            let max = u64_param(action, "maxIterations", 10_000);
            let mode = string_param(action, "mode", "count")?;
            let should_run = match mode {
                "count" => iteration < u64_param(action, "count", 1),
                "while" => {
                    evaluate_condition(
                        action.params.get("condition").unwrap_or(&Value::Null),
                        data,
                        vision,
                    )
                    .await?
                    .matched
                }
                "until" => {
                    !evaluate_condition(
                        action.params.get("condition").unwrap_or(&Value::Null),
                        data,
                        vision,
                    )
                    .await?
                    .matched
                }
                _ => {
                    return Err(AppError::coded(
                        "VALIDATION_ERROR",
                        format!("Unknown loop mode '{mode}'."),
                    ))
                }
            };
            enforce_loop_safety(should_run, iteration, max, &action.name)?;
            if should_run {
                Ok(ExecOutcome::Next)
            } else {
                data.loop_iterations.remove(&pointer);
                Ok(ExecOutcome::Jump(end + 1))
            }
        }
        "loop_end" => {
            let start = *flow.loop_start.get(&pointer).ok_or_else(|| {
                AppError::coded("VALIDATION_ERROR", "Loop start target is missing.")
            })?;
            *data.loop_iterations.entry(start).or_insert(0) += 1;
            Ok(ExecOutcome::Jump(start))
        }
        "break" => {
            let (start, end) =
                flow.enclosing_loop.get(&pointer).copied().ok_or_else(|| {
                    AppError::coded("VALIDATION_ERROR", "Break is outside a loop.")
                })?;
            data.loop_iterations.remove(&start);
            Ok(ExecOutcome::Jump(end + 1))
        }
        "continue" => {
            let (_, end) = flow.enclosing_loop.get(&pointer).copied().ok_or_else(|| {
                AppError::coded("VALIDATION_ERROR", "Continue is outside a loop.")
            })?;
            Ok(ExecOutcome::Jump(end))
        }
        "wait_condition" => {
            let result = wait_condition(
                app,
                action,
                control,
                vision,
                data,
                repeat_index,
                pointer,
                started,
            )
            .await;
            match result {
                Ok(()) => Ok(ExecOutcome::Next),
                Err(error)
                    if error.to_string().starts_with("CONDITION_TIMEOUT")
                        && action
                            .params
                            .pointer("/onTimeout/mode")
                            .and_then(Value::as_str)
                            == Some("jump") =>
                {
                    let label = action
                        .params
                        .pointer("/onTimeout/label")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    Ok(ExecOutcome::Jump(*flow.labels.get(label).ok_or_else(
                        || {
                            AppError::coded(
                                "VALIDATION_ERROR",
                                format!("Timeout jump target '{label}' is missing."),
                            )
                        },
                    )?))
                }
                Err(error) => Err(error),
            }
        }
        _ => {
            match execute_basic(
                app,
                action,
                control,
                input,
                vision,
                data,
                repeat_index,
                pointer,
                started,
            )
            .await
            {
                Ok(()) => Ok(ExecOutcome::Next),
                Err(error) if error.to_string().starts_with("IMAGE_TIMEOUT_JUMP:") => {
                    let target_row = error
                        .to_string()
                        .trim_start_matches("IMAGE_TIMEOUT_JUMP:")
                        .parse::<usize>()
                        .ok()
                        .filter(|row| *row > 0)
                        .ok_or_else(|| {
                            AppError::coded(
                                "VALIDATION_ERROR",
                                "Image timeout jump row must be a positive row number.",
                            )
                        })?;
                    Ok(ExecOutcome::Jump(target_row - 1))
                }
                Err(error) => Err(error),
            }
        }
    }
}

async fn execute_mouse_action(
    action: &Action,
    control: &RunControl,
    input: &NativeInput,
) -> AppResult<()> {
    let kind = string_param(action, "kind", "click")?;
    let button = string_param(action, "button", "left")?;
    let coordinate_space = string_param(action, "coordinateSpace", "virtual_screen")?;
    let target_title = action
        .params
        .pointer("/targetWindow/title")
        .and_then(Value::as_str)
        .unwrap_or("");
    if kind == "scroll" {
        let (x, y) = native::resolve_coordinate(
            i64_param(action, "x", 0) as i32,
            i64_param(action, "y", 0) as i32,
            coordinate_space,
            target_title,
        )?;
        let delta = scroll_delta(string_param(action, "scrollDirection", "down")?)?;
        let steps = u64_param(action, "scrollNotches", 3);
        let interval_ms = u64_param(action, "scrollIntervalMs", 30);
        for step in 0..steps {
            control.wait_ready().await?;
            input.scroll(x, y, delta)?;
            if step + 1 < steps && interval_ms > 0 {
                control.sleep(interval_ms).await?;
            }
        }
        return Ok(());
    }
    if kind == "swipe" {
        let start = native::resolve_coordinate(
            i64_param(action, "startX", 0) as i32,
            i64_param(action, "startY", 0) as i32,
            coordinate_space,
            target_title,
        )?;
        let end = native::resolve_coordinate(
            i64_param(action, "endX", 0) as i32,
            i64_param(action, "endY", 0) as i32,
            coordinate_space,
            target_title,
        )?;
        return execute_swipe(
            control,
            input,
            start,
            end,
            button,
            u64_param(action, "swipeDurationMs", 500),
        )
        .await;
    }

    let restore_position = bool_param(action, "restoreCursor", false)
        .then(native::cursor_position)
        .transpose()?;
    let (x, y) = native::resolve_coordinate(
        i64_param(action, "x", 0) as i32,
        i64_param(action, "y", 0) as i32,
        coordinate_space,
        target_title,
    )?;
    input.mouse(
        x,
        y,
        button,
        kind,
        u64_param(action, "clickCount", 1) as u32,
    )?;
    if let Some((restore_x, restore_y)) = restore_position {
        input.mouse(restore_x, restore_y, "left", "move", 1)?;
    }
    Ok(())
}

fn scroll_delta(direction: &str) -> AppResult<i32> {
    match direction {
        "up" => Ok(120),
        "down" => Ok(-120),
        _ => Err(AppError::coded(
            "INVALID_SCROLL",
            format!("Unknown scroll direction '{direction}'."),
        )),
    }
}

async fn execute_swipe(
    control: &RunControl,
    input: &NativeInput,
    start: (i32, i32),
    end: (i32, i32),
    button: &str,
    duration_ms: u64,
) -> AppResult<()> {
    input.mouse(start.0, start.1, button, "move", 1)?;
    input.mouse(start.0, start.1, button, "down", 1)?;
    let mut held = true;
    let mut current = start;
    let duration_ms = duration_ms.max(1);
    let steps = duration_ms.div_ceil(8).clamp(1, 50_000);
    let mut previous_target = 0;

    let swipe_result: AppResult<()> = async {
        for step in 1..=steps {
            let target = duration_ms.saturating_mul(step) / steps;
            let mut remaining = target.saturating_sub(previous_target);
            while remaining > 0 {
                control.check()?;
                if control.is_paused() {
                    if held {
                        input.mouse(current.0, current.1, button, "up", 1)?;
                        held = false;
                    }
                    control.wait_ready().await?;
                    input.mouse(current.0, current.1, button, "down", 1)?;
                    held = true;
                }
                let slice = remaining.min(8);
                tokio::time::sleep(Duration::from_millis(slice)).await;
                remaining -= slice;
            }
            control.check()?;
            current = swipe_point(start, end, step, steps);
            input.mouse(current.0, current.1, button, "move", 1)?;
            previous_target = target;
        }
        Ok(())
    }
    .await;

    let release_result = if held {
        input.mouse(current.0, current.1, button, "up", 1)
    } else {
        Ok(())
    };
    swipe_result?;
    release_result
}

fn swipe_point(start: (i32, i32), end: (i32, i32), step: u64, steps: u64) -> (i32, i32) {
    let x =
        i64::from(start.0) + (i64::from(end.0) - i64::from(start.0)) * step as i64 / steps as i64;
    let y =
        i64::from(start.1) + (i64::from(end.1) - i64::from(start.1)) * step as i64 / steps as i64;
    (x as i32, y as i32)
}

#[allow(clippy::too_many_arguments)]
async fn execute_basic(
    app: &AppHandle,
    action: &Action,
    control: &RunControl,
    input: &NativeInput,
    vision: &VisionWorker,
    data: &mut RuntimeData,
    repeat_index: u32,
    pointer: usize,
    started: Instant,
) -> AppResult<()> {
    for repetition in 0..action.generate {
        control.wait_ready().await?;
        match action.kind.as_str() {
            "keyboard" => {
                let keys = interpolate(
                    string_param(action, "keys", "")?,
                    &data.variables,
                    repeat_index,
                    pointer + 1,
                );
                input.keyboard(&keys, string_param(action, "mode", "press")?)?;
                if repetition + 1 < action.generate {
                    control
                        .sleep(u64_param(action, "interRepeatDelayMs", 0))
                        .await?;
                }
            }
            "mouse" => {
                execute_mouse_action(action, control, input).await?;
            }
            "text" => {
                let source = text_for_repeat(
                    string_param(action, "text", "")?,
                    bool_param(action, "linePerIteration", false),
                    repeat_index,
                );
                let text = interpolate(source, &data.variables, repeat_index, pointer + 1);
                if !text.is_empty() {
                    input.text(
                        &text,
                        bool_param(action, "clearFirst", false),
                        string_param(action, "method", "unicode")?,
                    )?;
                }
            }
            "variable" => {
                let output = execute_variable(action, &mut data.variables)?;
                if !output.is_empty() {
                    input.text(
                        &output,
                        bool_param(action, "clearFirst", false),
                        string_param(action, "typingMethod", "keystroke")?,
                    )?;
                }
            }
            "wait" => control.sleep(u64_param(action, "durationMs", 0)).await?,
            "wait_condition" => {
                wait_condition(
                    app,
                    action,
                    control,
                    vision,
                    data,
                    repeat_index,
                    pointer,
                    started,
                )
                .await?
            }
            "window" => {
                let operation = string_param(action, "operation", "activate")?;
                let title = action
                    .params
                    .pointer("/target/title")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let mode = action
                    .params
                    .pointer("/target/titleMatch")
                    .and_then(Value::as_str)
                    .unwrap_or("contains");
                let process = action
                    .params
                    .pointer("/target/process")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if operation.starts_with("wait_") {
                    let active = operation == "wait_active";
                    wait_for(control, 10_000, 250, || async {
                        native::window_matches(title, mode, process, active)
                    })
                    .await?;
                } else {
                    native::window_action(title, mode, process, operation)?;
                }
            }
            "find_image_click" => {
                let deadline = u64_param(action, "timeoutMs", 10_000);
                let poll = u64_param(action, "pollIntervalMs", 350).max(50);
                let template = string_param(action, "templateAsset", "")?.to_owned();
                let threshold = f64_param(action, "threshold", 0.9);
                let grayscale = bool_param(action, "grayscale", false);
                let region = image_region(&action.params);
                let started_wait = Instant::now();
                loop {
                    control.wait_ready().await?;
                    let result = vision
                        .match_screen(&template, threshold, grayscale, region)
                        .await?;
                    if result.found {
                        let x = result.x
                            + result.width as i32 / 2
                            + i64_param(action, "offsetX", 0) as i32;
                        let y = result.y
                            + result.height as i32 / 2
                            + i64_param(action, "offsetY", 0) as i32;
                        data.last_match = Some(result);
                        input.mouse(x, y, string_param(action, "button", "left")?, "click", 1)?;
                        break;
                    }
                    if started_wait.elapsed().as_millis() >= u128::from(deadline) {
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
                                .filter(|row| *row > 0)
                                .ok_or_else(|| {
                                    AppError::coded(
                                        "VALIDATION_ERROR",
                                        "Image timeout jump row must be a positive row number.",
                                    )
                                })?;
                            return Err(AppError::coded(
                                "IMAGE_TIMEOUT_JUMP",
                                (target_row as usize).to_string(),
                            ));
                        }
                        return Err(AppError::coded(
                            "CONDITION_TIMEOUT",
                            format!(
                                "Image '{}' was not found within {deadline} ms.",
                                action.name
                            ),
                        ));
                    }
                    control.sleep(poll).await?;
                }
            }
            _ => {
                return Err(AppError::coded(
                    "UNKNOWN_ACTION",
                    format!(
                        "Action type '{}' is not supported by the runtime.",
                        action.kind
                    ),
                ))
            }
        }
    }
    Ok(())
}

fn text_for_repeat(text: &str, line_per_iteration: bool, repeat_index: u32) -> &str {
    if !line_per_iteration {
        return text;
    }
    text.lines()
        .nth(repeat_index.saturating_sub(1) as usize)
        .unwrap_or("")
}

#[allow(clippy::too_many_arguments)]
async fn wait_condition(
    app: &AppHandle,
    action: &Action,
    control: &RunControl,
    vision: &VisionWorker,
    data: &mut RuntimeData,
    repeat_index: u32,
    pointer: usize,
    started: Instant,
) -> AppResult<()> {
    let poll = u64_param(action, "pollIntervalMs", 250).max(50);
    let timeout = u64_param(action, "timeoutMs", 10_000);
    let condition = action.params.get("condition").unwrap_or(&Value::Null);
    let mut active_elapsed = 0u64;
    loop {
        control.wait_ready().await?;
        emit_run(
            app,
            control,
            RunState::Waiting,
            repeat_index,
            Some(&action.id),
            Some(pointer + 1),
            &format!("Waiting: {} ms", active_elapsed),
            started,
        );
        let sample_started = Instant::now();
        let result = evaluate_condition(condition, data, vision).await?;
        if result.matched {
            if let Some(name) = action
                .params
                .get("saveResultTo")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
            {
                data.variables.insert(name.into(), Value::Bool(true));
            }
            data.last_match = result.image;
            return Ok(());
        }
        active_elapsed = active_elapsed.saturating_add(sample_started.elapsed().as_millis() as u64);
        if timeout > 0 && active_elapsed >= timeout {
            return match action
                .params
                .pointer("/onTimeout/mode")
                .and_then(Value::as_str)
                .unwrap_or("stop")
            {
                "skip" | "continue_warning" => Ok(()),
                _ => Err(AppError::coded(
                    "CONDITION_TIMEOUT",
                    format!("Condition '{}' timed out after {timeout} ms.", action.name),
                )),
            };
        }
        let sleep = if timeout > 0 {
            poll.min(timeout.saturating_sub(active_elapsed))
        } else {
            poll
        };
        control.sleep(sleep).await?;
        active_elapsed = active_elapsed.saturating_add(sleep);
    }
}

#[allow(clippy::too_many_arguments)]
async fn apply_retry_and_policy(
    app: &AppHandle,
    action: &Action,
    control: &RunControl,
    input: &NativeInput,
    vision: &VisionWorker,
    data: &mut RuntimeData,
    labels: &HashMap<String, usize>,
    original: &AppError,
) -> AppResult<ExecOutcome> {
    if original.to_string().starts_with("RUN_CANCELLED") {
        return Err(AppError::coded("RUN_CANCELLED", "Workflow was stopped."));
    }
    let retry = action.retry.as_ref();
    if let Some(retry) = retry {
        for attempt in 2..=retry.max_attempts.max(1) {
            let delay = if retry.backoff.as_deref() == Some("linear") {
                retry.delay_ms.saturating_mul(u64::from(attempt - 1))
            } else {
                retry.delay_ms
            };
            control.sleep(delay).await?;
            emit_action(app, control, action, "running", attempt, Some("Retrying"));
            let result = match action.kind.as_str() {
                "keyboard" => input.keyboard(
                    string_param(action, "keys", "")?,
                    string_param(action, "mode", "press")?,
                ),
                "mouse" => execute_mouse_action(action, control, input).await,
                "text" => input.text(
                    &interpolate(string_param(action, "text", "")?, &data.variables, 1, 1),
                    bool_param(action, "clearFirst", false),
                    string_param(action, "method", "unicode")?,
                ),
                _ => Err(AppError::coded(
                    "RETRY_UNAVAILABLE",
                    "This action type cannot be retried outside its execution context.",
                )),
            };
            if result.is_ok() {
                return Ok(ExecOutcome::Next);
            }
            let _ = vision;
        }
    }
    match action.failure_policy.clone().unwrap_or(FailurePolicy::Stop) {
        FailurePolicy::Stop => Err(AppError::coded("ACTION_FAILED", original.to_string())),
        FailurePolicy::Skip | FailurePolicy::ContinueWarning => Ok(ExecOutcome::Next),
        FailurePolicy::Jump { label } => {
            Ok(ExecOutcome::Jump(*labels.get(&label).ok_or_else(|| {
                AppError::coded(
                    "VALIDATION_ERROR",
                    format!("Failure jump target '{label}' is missing."),
                )
            })?))
        }
    }
}

struct EvalResult {
    matched: bool,
    image: Option<MatchResult>,
}

pub async fn test_condition(condition: &Value, vision: &VisionWorker) -> AppResult<Value> {
    let started = Instant::now();
    let mut data = RuntimeData::default();
    let result = evaluate_condition(condition, &mut data, vision).await?;
    Ok(json!({
        "matched": result.matched,
        "elapsedMs": started.elapsed().as_millis(),
        "confidence": result.image.as_ref().map(|image| image.confidence),
        "x": result.image.as_ref().map(|image| image.x + image.width as i32 / 2),
        "y": result.image.as_ref().map(|image| image.y + image.height as i32 / 2)
    }))
}

#[async_recursion]
async fn evaluate_condition(
    condition: &Value,
    data: &mut RuntimeData,
    vision: &VisionWorker,
) -> AppResult<EvalResult> {
    if let Some(op) = condition.get("op").and_then(Value::as_str) {
        return match op {
            "not" => {
                let result =
                    evaluate_condition(condition.get("item").unwrap_or(&Value::Null), data, vision)
                        .await?;
                Ok(EvalResult {
                    matched: !result.matched,
                    image: result.image,
                })
            }
            "and" => {
                for item in condition
                    .get("items")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        AppError::coded("INVALID_CONDITION", "AND condition needs items.")
                    })?
                {
                    let result = evaluate_condition(item, data, vision).await?;
                    if !result.matched {
                        return Ok(result);
                    }
                }
                Ok(EvalResult {
                    matched: true,
                    image: None,
                })
            }
            "or" => {
                for item in condition
                    .get("items")
                    .and_then(Value::as_array)
                    .ok_or_else(|| {
                        AppError::coded("INVALID_CONDITION", "OR condition needs items.")
                    })?
                {
                    let result = evaluate_condition(item, data, vision).await?;
                    if result.matched {
                        return Ok(result);
                    }
                }
                Ok(EvalResult {
                    matched: false,
                    image: None,
                })
            }
            _ => Err(AppError::coded(
                "INVALID_CONDITION",
                format!("Unknown composite operator '{op}'."),
            )),
        };
    }
    let kind = condition
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("always");
    match kind {
        "always" => Ok(EvalResult {
            matched: true,
            image: None,
        }),
        "never" => Ok(EvalResult {
            matched: false,
            image: None,
        }),
        "variable_compare" => {
            let name = condition
                .get("variable")
                .and_then(Value::as_str)
                .unwrap_or("");
            let actual = data.variables.get(name).unwrap_or(&Value::Null);
            let expected = condition.get("value").unwrap_or(&Value::Null);
            let operator = condition
                .get("operator")
                .and_then(Value::as_str)
                .unwrap_or("==");
            Ok(EvalResult {
                matched: compare(actual, expected, operator),
                image: None,
            })
        }
        "pixel_match" | "pixel_changed" => {
            let actual = native::pixel(
                condition.get("x").and_then(Value::as_i64).unwrap_or(0) as i32,
                condition.get("y").and_then(Value::as_i64).unwrap_or(0) as i32,
            )?;
            let expected = condition
                .get("rgb")
                .and_then(Value::as_array)
                .ok_or_else(|| {
                    AppError::coded("INVALID_CONDITION", "Pixel condition needs RGB values.")
                })?;
            let tolerance = condition
                .get("tolerance")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .max(0);
            let close = (0..3).all(|index| {
                (i64::from(actual[index])
                    - expected.get(index).and_then(Value::as_i64).unwrap_or(0))
                .abs()
                    <= tolerance
            });
            Ok(EvalResult {
                matched: if kind == "pixel_changed" {
                    !close
                } else {
                    close
                },
                image: None,
            })
        }
        "window_exists" | "window_active" => {
            let title = condition
                .pointer("/target/title")
                .and_then(Value::as_str)
                .unwrap_or("");
            let mode = condition
                .pointer("/target/titleMatch")
                .and_then(Value::as_str)
                .unwrap_or("contains");
            let process = condition
                .pointer("/target/process")
                .and_then(Value::as_str)
                .unwrap_or("");
            Ok(EvalResult {
                matched: native::window_matches(title, mode, process, kind == "window_active")?,
                image: None,
            })
        }
        "image_present" | "image_absent" => {
            let template = condition
                .get("templateAsset")
                .and_then(Value::as_str)
                .unwrap_or("");
            let region = condition.get("region").map(|region| {
                (
                    region.get("x").and_then(Value::as_i64).unwrap_or(0) as i32,
                    region.get("y").and_then(Value::as_i64).unwrap_or(0) as i32,
                    region.get("width").and_then(Value::as_u64).unwrap_or(0) as u32,
                    region.get("height").and_then(Value::as_u64).unwrap_or(0) as u32,
                )
            });
            let result = vision
                .match_screen(
                    template,
                    condition
                        .get("threshold")
                        .and_then(Value::as_f64)
                        .unwrap_or(0.9),
                    condition
                        .get("grayscale")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    region,
                )
                .await?;
            let matched = if kind == "image_absent" {
                !result.found
            } else {
                result.found
            };
            Ok(EvalResult {
                matched,
                image: Some(result),
            })
        }
        _ => Err(AppError::coded(
            "INVALID_CONDITION",
            format!("Unknown condition type '{kind}'."),
        )),
    }
}

fn execute_variable(action: &Action, variables: &mut HashMap<String, Value>) -> AppResult<String> {
    let name = string_param(action, "variable", "var1")?.to_owned();
    let operation = string_param(action, "operation", "set")?;
    let value = action.params.get("value").cloned().unwrap_or(Value::Null);
    let radix = action
        .params
        .get("radix")
        .and_then(Value::as_u64)
        .filter(|value| matches!(value, 2 | 8 | 10 | 16))
        .unwrap_or(10) as u32;
    let min_length = action
        .params
        .get("minLength")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let output = match operation {
        "set" => {
            let current = format_variable_value(value, radix, min_length);
            let output = value_string(&current);
            variables.insert(name, current);
            output
        }
        "clear" => {
            variables.insert(name, Value::String(String::new()));
            String::new()
        }
        "append" => {
            let current = variables.get(&name).map(value_string).unwrap_or_default();
            let output = format!("{current}{}", value_string(&value));
            variables.insert(name, Value::String(output.clone()));
            output
        }
        "increment" | "decrement" => {
            // Type the current value first, then store the next value. For example,
            // initial=1 and increment=1 produces 1, 2, 3 across repetitions.
            let current_value = variables
                .get(&name)
                .cloned()
                .unwrap_or_else(|| format_variable_value(value, radix, min_length));
            let current = parse_variable_number(&current_value, radix).unwrap_or(0.0);
            let display = format_variable_value(current_value, radix, min_length);
            let output = value_string(&display);
            let amount = action
                .params
                .get("increment")
                .and_then(Value::as_f64)
                .unwrap_or(1.0)
                * if operation == "decrement" { -1.0 } else { 1.0 };
            let next_number = current + amount;
            let next = if next_number.fract() == 0.0
                && next_number >= i64::MIN as f64
                && next_number <= i64::MAX as f64
            {
                Value::Number(Number::from(next_number as i64))
            } else {
                Number::from_f64(next_number)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            };
            variables.insert(name, format_variable_value(next, radix, min_length));
            output
        }
        "cast" => {
            let output = value_string(&value);
            variables.insert(name, Value::String(output.clone()));
            output
        }
        _ => {
            return Err(AppError::coded(
                "INVALID_VARIABLE_OPERATION",
                format!("Unknown variable operation '{operation}'."),
            ))
        }
    };
    Ok(output)
}

fn parse_variable_number(value: &Value, radix: u32) -> Option<f64> {
    if let Some(number) = value.as_f64() {
        return Some(number);
    }
    let text = value.as_str()?.trim();
    if radix == 10 {
        text.parse().ok()
    } else {
        let (negative, digits) = text
            .strip_prefix('-')
            .map_or((false, text), |digits| (true, digits));
        i64::from_str_radix(digits, radix)
            .ok()
            .map(|number| if negative { -number } else { number } as f64)
    }
}

fn format_variable_value(value: Value, radix: u32, min_length: usize) -> Value {
    let Some(number) = value.as_i64() else {
        return value;
    };
    if radix == 10 && min_length == 0 {
        return value;
    }
    let negative = number.is_negative();
    let magnitude = number.unsigned_abs();
    let digits = match radix {
        2 => format!("{magnitude:b}"),
        8 => format!("{magnitude:o}"),
        16 => format!("{magnitude:X}"),
        _ => magnitude.to_string(),
    };
    let padded = format!("{digits:0>min_length$}");
    Value::String(if negative {
        format!("-{padded}")
    } else {
        padded
    })
}

fn compile_flow(workflow: &Workflow) -> AppResult<FlowMap> {
    let mut map = FlowMap::default();
    let mut if_stack: Vec<(usize, Option<usize>)> = Vec::new();
    let mut loop_stack = Vec::new();
    for (index, action) in workflow.actions.iter().enumerate() {
        if let Some((start, _)) = loop_stack.last().copied() {
            map.enclosing_loop.insert(index, (start, usize::MAX));
        }
        match action.kind.as_str() {
            "if" => if_stack.push((index, None)),
            "else" => {
                if let Some((_, alternative)) = if_stack.last_mut() {
                    *alternative = Some(index);
                } else {
                    return Err(AppError::coded(
                        "VALIDATION_ERROR",
                        "Else has no matching If.",
                    ));
                }
            }
            "end_if" => {
                let (start, alternative) = if_stack.pop().ok_or_else(|| {
                    AppError::coded("VALIDATION_ERROR", "End If has no matching If.")
                })?;
                map.if_false
                    .insert(start, alternative.map_or(index + 1, |value| value + 1));
                if let Some(alternative) = alternative {
                    map.else_end.insert(alternative, index + 1);
                }
            }
            "loop_start" => loop_stack.push((index, index)),
            "loop_end" => {
                let (start, _) = loop_stack.pop().ok_or_else(|| {
                    AppError::coded("VALIDATION_ERROR", "End Loop has no matching Loop.")
                })?;
                map.loop_end.insert(start, index);
                map.loop_start.insert(index, start);
                for location in start + 1..index {
                    if map
                        .enclosing_loop
                        .get(&location)
                        .is_some_and(|(owner, _)| *owner == start)
                    {
                        map.enclosing_loop.insert(location, (start, index));
                    }
                }
            }
            "label" => {
                if let Some(label) = action.params.get("label").and_then(Value::as_str) {
                    map.labels.insert(label.into(), index);
                }
            }
            _ => {}
        }
    }
    if !if_stack.is_empty() || !loop_stack.is_empty() {
        return Err(AppError::coded(
            "VALIDATION_ERROR",
            "Workflow contains an unclosed flow block.",
        ));
    }
    Ok(map)
}

fn resolve_jump_target(action: &Action, flow: &FlowMap, action_count: usize) -> AppResult<usize> {
    if let Some(value) = action.params.get("targetRow") {
        let row = value
            .as_u64()
            .and_then(|row| usize::try_from(row).ok())
            .filter(|row| (1..=action_count).contains(row))
            .ok_or_else(|| {
                AppError::coded(
                    "VALIDATION_ERROR",
                    format!("Jump row must be between 1 and {action_count}."),
                )
            })?;
        return Ok(row - 1);
    }

    // Projects created before row jumps used named labels. Keep them executable so
    // opening an old project does not break; the editor converts them when saved.
    let label = string_param(action, "label", "")?;
    flow.labels.get(label).copied().ok_or_else(|| {
        AppError::coded(
            "VALIDATION_ERROR",
            format!("Jump target '{label}' does not exist."),
        )
    })
}

fn enforce_loop_safety(
    should_run: bool,
    iteration: u64,
    max: u64,
    action_name: &str,
) -> AppResult<()> {
    if should_run && iteration >= max {
        return Err(AppError::coded(
            "LOOP_SAFETY_LIMIT",
            format!("Loop '{action_name}' reached its {max} iteration safety limit."),
        ));
    }
    Ok(())
}

async fn wait_for<F, Fut>(
    control: &RunControl,
    timeout: u64,
    poll: u64,
    mut condition: F,
) -> AppResult<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = AppResult<bool>>,
{
    let mut elapsed = 0;
    loop {
        control.wait_ready().await?;
        if condition().await? {
            return Ok(());
        }
        if elapsed >= timeout {
            return Err(AppError::coded(
                "CONDITION_TIMEOUT",
                "Window condition timed out.",
            ));
        }
        control.sleep(poll).await?;
        elapsed += poll;
    }
}

fn compare(actual: &Value, expected: &Value, operator: &str) -> bool {
    match operator {
        "==" => actual == expected || value_string(actual) == value_string(expected),
        "!=" => actual != expected && value_string(actual) != value_string(expected),
        "contains" => value_string(actual).contains(&value_string(expected)),
        ">" | ">=" | "<" | "<=" => {
            let a = actual
                .as_f64()
                .or_else(|| actual.as_str().and_then(|value| value.parse().ok()));
            let b = expected
                .as_f64()
                .or_else(|| expected.as_str().and_then(|value| value.parse().ok()));
            match (a, b, operator) {
                (Some(a), Some(b), ">") => a > b,
                (Some(a), Some(b), ">=") => a >= b,
                (Some(a), Some(b), "<") => a < b,
                (Some(a), Some(b), "<=") => a <= b,
                _ => false,
            }
        }
        _ => false,
    }
}

fn interpolate(
    template: &str,
    variables: &HashMap<String, Value>,
    repeat: u32,
    action_index: usize,
) -> String {
    let regex = Regex::new(r"\$\{([A-Za-z_][A-Za-z0-9_.]*)\}").expect("static interpolation regex");
    regex
        .replace_all(template, |captures: &regex::Captures<'_>| {
            match &captures[1] {
                "run.repeatIndex" => repeat.to_string(),
                "action.index" => action_index.to_string(),
                name => variables
                    .get(name)
                    .map(value_string)
                    .unwrap_or_else(|| captures[0].to_owned()),
            }
        })
        .into_owned()
}
fn value_string(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}
fn string_param<'a>(action: &'a Action, name: &str, default: &'a str) -> AppResult<&'a str> {
    Ok(action
        .params
        .get(name)
        .and_then(Value::as_str)
        .unwrap_or(default))
}
fn u64_param(action: &Action, name: &str, default: u64) -> u64 {
    action
        .params
        .get(name)
        .and_then(Value::as_u64)
        .unwrap_or(default)
}
fn i64_param(action: &Action, name: &str, default: i64) -> i64 {
    action
        .params
        .get(name)
        .and_then(Value::as_i64)
        .unwrap_or(default)
}
fn f64_param(action: &Action, name: &str, default: f64) -> f64 {
    action
        .params
        .get(name)
        .and_then(Value::as_f64)
        .unwrap_or(default)
}
fn bool_param(action: &Action, name: &str, default: bool) -> bool {
    action
        .params
        .get(name)
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn image_region(value: &Value) -> Option<(i32, i32, u32, u32)> {
    let region = value.get("region")?;
    let width = region.get("width")?.as_u64()? as u32;
    let height = region.get("height")?.as_u64()? as u32;
    (width > 0 && height > 0).then(|| {
        (
            region.get("x").and_then(Value::as_i64).unwrap_or(0) as i32,
            region.get("y").and_then(Value::as_i64).unwrap_or(0) as i32,
            width,
            height,
        )
    })
}

#[allow(clippy::too_many_arguments)]
fn emit_run(
    app: &AppHandle,
    control: &RunControl,
    state: RunState,
    repeat_index: u32,
    action_id: Option<&str>,
    action_index: Option<usize>,
    message: &str,
    started: Instant,
) {
    let _ = app.emit(
        "run_state",
        RunStateEvent {
            run_id: control.run_id.clone(),
            state,
            repeat_index,
            action_id: action_id.map(str::to_owned),
            action_index,
            message: message.into(),
            elapsed_ms: started.elapsed().as_millis(),
        },
    );
}
fn emit_action(
    app: &AppHandle,
    control: &RunControl,
    action: &Action,
    state: &str,
    attempt: u32,
    message: Option<&str>,
) {
    let _ = app.emit(
        "action_state",
        ActionStateEvent {
            run_id: control.run_id.clone(),
            action_id: action.id.clone(),
            state: state.into(),
            attempt,
            message: message.map(str::to_owned),
        },
    );
}
#[allow(clippy::too_many_arguments)]
fn emit_log(
    app: &AppHandle,
    control: &RunControl,
    action: &Action,
    index: usize,
    state: &str,
    duration: u128,
    error: Option<&AppError>,
    retry_count: u32,
) {
    let _ = app.emit(
        "run_log",
        RunLogEntry {
            timestamp: Utc::now().to_rfc3339(),
            run_id: control.run_id.clone(),
            action_id: Some(action.id.clone()),
            action_index: Some(index),
            action_name: Some(action.name.clone()),
            state: state.into(),
            result: error.is_none().then(|| "ok".into()),
            duration_ms: Some(duration),
            retry_count,
            error_code: error.map(|_| "ACTION_FAILED".into()),
            message: error.map(ToString::to_string),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Action;
    use std::collections::HashMap;

    #[test]
    fn interpolation_preserves_unknown_values() {
        let mut values = HashMap::new();
        values.insert("name".into(), json!("Ada"));
        assert_eq!(
            interpolate("Hi ${name} ${missing} ${run.repeatIndex}", &values, 3, 2),
            "Hi Ada ${missing} 3"
        );
    }
    #[test]
    fn text_line_mode_uses_workflow_repeat_and_allows_overflow() {
        let text = "Ali\nSara\nUsman";
        assert_eq!(text_for_repeat(text, false, 2), text);
        assert_eq!(text_for_repeat(text, true, 1), "Ali");
        assert_eq!(text_for_repeat(text, true, 2), "Sara");
        assert_eq!(text_for_repeat(text, true, 3), "Usman");
        assert_eq!(text_for_repeat(text, true, 4), "");
    }
    #[test]
    fn variable_formatting_honors_radix_and_minimum_length() {
        assert_eq!(format_variable_value(json!(15), 16, 4), json!("000F"));
        assert_eq!(format_variable_value(json!(-5), 2, 4), json!("-0101"));
        assert_eq!(parse_variable_number(&json!("000F"), 16), Some(15.0));
    }
    #[test]
    fn increment_variable_outputs_current_value_then_stores_next_value() {
        let action = Action {
            id: "counter".into(),
            kind: "variable".into(),
            name: "Counter".into(),
            enabled: true,
            delay_after_ms: 0,
            generate: 1,
            params: json!({
                "variable": "count",
                "operation": "increment",
                "value": 1,
                "increment": 1,
                "radix": 10,
                "minLength": 0
            }),
            guard: None,
            retry: None,
            failure_policy: None,
            comment: None,
            extra: HashMap::new(),
        };
        let mut variables = HashMap::new();

        assert_eq!(execute_variable(&action, &mut variables).unwrap(), "1");
        assert_eq!(variables.get("count"), Some(&json!(2)));
        assert_eq!(execute_variable(&action, &mut variables).unwrap(), "2");
        assert_eq!(variables.get("count"), Some(&json!(3)));
    }
    #[test]
    fn image_region_is_read_from_action_parameters() {
        assert_eq!(
            image_region(&json!({ "region": { "x": -20, "y": 5, "width": 800, "height": 600 } })),
            Some((-20, 5, 800, 600))
        );
        assert_eq!(
            image_region(&json!({ "region": { "x": 0, "y": 0, "width": 0, "height": 10 } })),
            None
        );
    }
    #[test]
    fn row_jump_targets_are_one_based_and_legacy_labels_still_open() {
        let mut action = Action {
            id: "jump".into(),
            kind: "jump".into(),
            name: "Jump".into(),
            enabled: true,
            delay_after_ms: 0,
            generate: 1,
            params: json!({ "targetRow": 4 }),
            guard: None,
            retry: None,
            failure_policy: None,
            comment: None,
            extra: HashMap::new(),
        };
        let mut flow = FlowMap::default();
        flow.labels.insert("old-label".into(), 2);

        assert_eq!(resolve_jump_target(&action, &flow, 5).unwrap(), 3);
        action.params = json!({ "targetRow": 0 });
        assert!(resolve_jump_target(&action, &flow, 5).is_err());
        action.params = json!({ "label": "old-label" });
        assert_eq!(resolve_jump_target(&action, &flow, 5).unwrap(), 2);
    }
    #[test]
    fn loop_safety_allows_natural_exit_at_the_limit() {
        assert!(enforce_loop_safety(false, 10, 10, "Loop").is_ok());
        assert!(enforce_loop_safety(true, 9, 10, "Loop").is_ok());
        assert!(enforce_loop_safety(true, 10, 10, "Loop").is_err());
    }
    #[test]
    fn swipe_interpolation_reaches_midpoint_and_exact_endpoint() {
        assert_eq!(swipe_point((100, 700), (500, 100), 0, 10), (100, 700));
        assert_eq!(swipe_point((100, 700), (500, 100), 5, 10), (300, 400));
        assert_eq!(swipe_point((100, 700), (500, 100), 10, 10), (500, 100));
        assert_eq!(swipe_point((-200, -100), (200, 100), 2, 4), (0, 0));
    }
    #[test]
    fn scroll_direction_maps_to_standard_windows_wheel_delta() {
        assert_eq!(scroll_delta("up").unwrap(), 120);
        assert_eq!(scroll_delta("down").unwrap(), -120);
        assert!(scroll_delta("sideways").is_err());
    }
    #[tokio::test]
    async fn boolean_conditions_drive_if_and_conditional_loops_correctly() {
        let vision = VisionWorker::default();
        let mut data = RuntimeData::default();
        data.variables.insert("count".into(), json!(5));

        assert!(
            evaluate_condition(&json!({ "kind": "always" }), &mut data, &vision)
                .await
                .unwrap()
                .matched
        );
        assert!(
            !evaluate_condition(&json!({ "kind": "never" }), &mut data, &vision)
                .await
                .unwrap()
                .matched
        );
        assert!(evaluate_condition(
            &json!({
                "op": "and",
                "items": [
                    { "kind": "variable_compare", "variable": "count", "operator": ">=", "value": 5 },
                    { "op": "not", "item": { "kind": "never" } }
                ]
            }),
            &mut data,
            &vision,
        )
        .await
        .unwrap()
        .matched);
        assert!(
            evaluate_condition(
                &json!({
                    "op": "or",
                    "items": [{ "kind": "never" }, { "kind": "always" }]
                }),
                &mut data,
                &vision,
            )
            .await
            .unwrap()
            .matched
        );
    }
    #[test]
    fn compiles_nested_flow_targets() {
        let kinds = ["if", "loop_start", "loop_end", "else", "end_if"];
        let actions = kinds
            .iter()
            .enumerate()
            .map(|(index, kind)| Action {
                id: index.to_string(),
                kind: (*kind).into(),
                name: (*kind).into(),
                enabled: true,
                delay_after_ms: 0,
                generate: 1,
                params: json!({}),
                guard: None,
                retry: None,
                failure_policy: None,
                comment: None,
                extra: HashMap::new(),
            })
            .collect();
        let workflow = Workflow {
            schema_version: 1,
            name: "test".into(),
            repeat_times: 1,
            actions,
            extra: HashMap::new(),
        };
        let flow = compile_flow(&workflow).unwrap();
        assert_eq!(flow.if_false[&0], 4);
        assert_eq!(flow.else_end[&3], 5);
        assert_eq!(flow.loop_end[&1], 2);
    }
    #[test]
    fn compiles_if_else_and_nested_loop_control_targets() {
        let kinds = [
            "if",
            "wait",
            "else",
            "wait",
            "end_if",
            "loop_start",
            "loop_start",
            "break",
            "loop_end",
            "continue",
            "loop_end",
        ];
        let actions = kinds
            .iter()
            .enumerate()
            .map(|(index, kind)| Action {
                id: index.to_string(),
                kind: (*kind).into(),
                name: (*kind).into(),
                enabled: true,
                delay_after_ms: 0,
                generate: 1,
                params: json!({}),
                guard: None,
                retry: None,
                failure_policy: None,
                comment: None,
                extra: HashMap::new(),
            })
            .collect();
        let workflow = Workflow {
            schema_version: 1,
            name: "control-flow".into(),
            repeat_times: 1,
            actions,
            extra: HashMap::new(),
        };

        let flow = compile_flow(&workflow).unwrap();

        assert_eq!(flow.if_false[&0], 3);
        assert_eq!(flow.else_end[&2], 5);
        assert_eq!(flow.loop_end[&5], 10);
        assert_eq!(flow.loop_start[&10], 5);
        assert_eq!(flow.loop_end[&6], 8);
        assert_eq!(flow.loop_start[&8], 6);
        assert_eq!(flow.enclosing_loop[&7], (6, 8));
        assert_eq!(flow.enclosing_loop[&9], (5, 10));
    }
    #[tokio::test]
    async fn cancellation_interrupts_long_wait() {
        let control = RunControl::new();
        let clone = control.clone();
        let task = tokio::spawn(async move { clone.sleep(5_000).await });
        tokio::time::sleep(Duration::from_millis(20)).await;
        control.cancel();
        assert!(task.await.unwrap().is_err());
    }
}
