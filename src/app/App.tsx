import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ActionTable } from "../components/ActionTable";
import premiumIcon from "../assets/app-icon-premium.png";
import { BottomBar } from "../components/BottomBar";
import { ClassicToolbar } from "../components/ClassicToolbar";
import { MenuBar } from "../components/MenuBar";
import { Modal } from "../components/Modal";
import { ActionDialog } from "../dialogs/ActionDialog";
import { LaunchDialog, type LaunchSettings } from "../dialogs/LaunchDialog";
import { createAction, emptyWorkflow, type ActionType } from "../editor/factories";
import { historyReducer, initialHistory } from "../editor/history";
import { insertActionAfterSelection } from "../editor/insertion";
import {
  actionIdForRecordedEvent,
  appendRecordedAction,
  removeDuplicateRecordedEvents,
} from "../editor/recorder";
import { validateWorkflow } from "../editor/validation";
import { isModifierKey, keyboardEventToChord } from "../lib/keys";
import { backend, isTauri } from "../lib/tauri";
import { primaryHotkeyIntent } from "./primaryHotkey";
import type {
  ActionStateEvent,
  KeyboardAction,
  RunLogEntry,
  RunState,
  ValidationIssue,
  Workflow,
  WorkflowAction,
} from "../types/workflow";

type InfoView = "shortcuts" | "diagnostics" | "about" | "logs" | undefined;

interface RecoveryData {
  savedAt: string;
  workflow: Workflow;
}

const defaultLaunchSettings: LaunchSettings = {
  mode: "hotkey",
  startHotkey: "F1",
  stopHotkey: "F2",
  delaySeconds: 5,
};

function readLaunchSettings(): LaunchSettings {
  try {
    const value = localStorage.getItem("autokeyboard.launch");
    return value ? (JSON.parse(value) as LaunchSettings) : defaultLaunchSettings;
  } catch {
    return defaultLaunchSettings;
  }
}

function readRecovery(): RecoveryData | undefined {
  try {
    const value = localStorage.getItem("autokeyboard.recovery");
    return value ? (JSON.parse(value) as RecoveryData) : undefined;
  } catch {
    return undefined;
  }
}

async function minimizeMainWindow() {
  if (isTauri()) await getCurrentWindow().minimize();
}

async function restoreMainWindow() {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
}

export function App() {
  const [history, dispatch] = useReducer(historyReducer, emptyWorkflow(), initialHistory);
  const workflow = history.present;
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<WorkflowAction>();
  const [projectPath, setProjectPath] = useState<string>();
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(workflow));
  const [runState, setRunState] = useState<RunState>("idle");
  const [status, setStatus] = useState("Ready");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState<number>();
  const [actionStates, setActionStates] = useState<Record<string, ActionStateEvent["state"]>>({});
  const [issues, setIssues] = useState<ValidationIssue[]>();
  const [infoView, setInfoView] = useState<InfoView>();
  const [diagnostics, setDiagnostics] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [recovery, setRecovery] = useState<RecoveryData | undefined>(readRecovery);
  const [recording, setRecording] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchSettings, setLaunchSettings] = useState(readLaunchSettings);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [savingBeforeClose, setSavingBeforeClose] = useState(false);
  const launchTimerRef = useRef<number | undefined>(undefined);
  const dirty = JSON.stringify(workflow) !== savedSnapshot;
  const dirtyRef = useRef(dirty);
  const allowCloseRef = useRef(false);
  dirtyRef.current = dirty;
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selected = workflow.actions.find((action) => action.id === selectedId);
  const busy = !["idle", "completed", "failed", "cancelled"].includes(runState);
  const busyRef = useRef(busy);
  const runStateRef = useRef(runState);
  const recordingRef = useRef(recording);
  busyRef.current = busy;
  runStateRef.current = runState;
  recordingRef.current = recording;

  const commit = useCallback((next: Workflow) => dispatch({ type: "commit", workflow: next }), []);
  const confirmDiscard = useCallback(
    async () =>
      !dirty ||
      (isTauri()
        ? confirm("Discard unsaved changes?", { title: "AutoKeyboard Advanced", kind: "warning" })
        : window.confirm("Discard unsaved changes?")),
    [dirty],
  );

  useEffect(() => {
    const title = `${dirty ? "*" : ""}${workflow.name || "Untitled"} - AutoKeyboard Advanced`;
    document.title = title;
    if (isTauri()) void getCurrentWindow().setTitle(title);
  }, [dirty, workflow.name]);

  useEffect(() => {
    if (!startedAt || !busy) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [busy, startedAt]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const track = (listener: Promise<() => void>) => {
      void listener.then((unlisten) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      });
    };
    track(
      backend.onRunState((event) => {
        setRunState(event.state);
        setStatus(event.message ?? event.state);
        if (["completed", "failed", "cancelled"].includes(event.state)) {
          setStartedAt(undefined);
          void restoreMainWindow();
        }
      }),
    );
    track(
      backend.onActionState((event) =>
        setActionStates((current) => ({ ...current, [event.actionId]: event.state })),
      ),
    );
    track(backend.onRunLog((entry) => setLogs((current) => [...current.slice(-999), entry])));
    track(
      backend.onRecordedAction((action) => {
        const next = appendRecordedAction(workflowRef.current, action, selectedIdRef.current);
        if (next === workflowRef.current) return;
        workflowRef.current = next;
        dispatch({ type: "commit", workflow: next });
        const insertedId = actionIdForRecordedEvent(next, action.id);
        selectedIdRef.current = insertedId;
        setSelectedId(insertedId);
      }),
    );
    track(
      backend.onRecorderState((active) => {
        setRecording(active);
        setStatus(active ? "Recording clicks and keystrokes…" : "Recording stopped");
        if (!active) void restoreMainWindow();
      }),
    );
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(
    () => () => {
      if (launchTimerRef.current !== undefined) window.clearTimeout(launchTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isTauri()) {
      const beforeUnload = (event: BeforeUnloadEvent) => {
        if (dirtyRef.current && !allowCloseRef.current) event.preventDefault();
      };
      window.addEventListener("beforeunload", beforeUnload);
      return () => window.removeEventListener("beforeunload", beforeUnload);
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowCloseRef.current || !dirtyRef.current) return;
        event.preventDefault();
        setClosePromptOpen(true);
      })
      .then((next) => {
        if (disposed) next();
        else unlisten = next;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!dirty || busy) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        "autokeyboard.recovery",
        JSON.stringify({ savedAt: new Date().toISOString(), workflow }),
      );
    }, 1_500);
    return () => clearTimeout(timer);
  }, [busy, dirty, workflow]);

  const newProject = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const next = emptyWorkflow();
    dispatch({ type: "replace", workflow: next });
    setSavedSnapshot(JSON.stringify(next));
    setProjectPath(undefined);
    setSelectedId(undefined);
    setActionStates({});
    setStatus("New project");
    localStorage.removeItem("autokeyboard.recovery");
  }, [confirmDiscard]);

  const openProject = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    try {
      if (isTauri()) {
        const path = await open({
          multiple: false,
          filters: [{ name: "AutoKeyboard projects", extensions: ["akx", "json"] }],
        });
        if (!path) return;
        const loaded = await backend.openProject(path);
        dispatch({ type: "replace", workflow: loaded });
        setSavedSnapshot(JSON.stringify(loaded));
        setProjectPath(path);
        setSelectedId(undefined);
        setStatus(`Opened ${path}`);
        localStorage.removeItem("autokeyboard.recovery");
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.akx.json";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const loaded = JSON.parse(await file.text()) as Workflow;
          dispatch({ type: "replace", workflow: loaded });
          setSavedSnapshot(JSON.stringify(loaded));
          setProjectPath(file.name);
          localStorage.removeItem("autokeyboard.recovery");
        };
        input.click();
      }
    } catch (error) {
      setStatus(`Open failed: ${String(error)}`);
    }
  }, [confirmDiscard]);

  const saveProject = useCallback(
    async (forceAs = false): Promise<boolean> => {
      const project = removeDuplicateRecordedEvents(workflowRef.current);
      if (project !== workflowRef.current) {
        workflowRef.current = project;
        dispatch({ type: "commit", workflow: project });
        setStatus("Removed duplicate recorder events before saving");
      }
      const localIssues = validateWorkflow(project);
      if (localIssues.length) {
        setIssues(localIssues);
        return false;
      }
      try {
        let path = forceAs ? undefined : projectPath;
        if (isTauri()) {
          if (!path)
            path =
              (await save({
                defaultPath: `${workflowRef.current.name || "workflow"}.akx`,
                filters: [
                  { name: "AutoKeyboard project", extensions: ["akx"] },
                  { name: "Development JSON", extensions: ["akx.json", "json"] },
                ],
              })) ?? undefined;
          if (!path) return false;
          await backend.saveProject(path, project);
        } else {
          const blob = new Blob([JSON.stringify(project, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${workflowRef.current.name || "workflow"}.akx.json`;
          link.click();
          URL.revokeObjectURL(url);
          path = link.download;
        }
        setProjectPath(path);
        setSavedSnapshot(JSON.stringify(project));
        setStatus(`Saved ${path}`);
        localStorage.removeItem("autokeyboard.recovery");
        return true;
      } catch (error) {
        setStatus(`Save failed: ${String(error)}`);
        return false;
      }
    },
    [projectPath],
  );

  const addAction = useCallback((type: ActionType) => setEditing(createAction(type)), []);
  const appendQuickKeystroke = useCallback((keys: string) => {
    const action = createAction("keyboard") as KeyboardAction;
    action.name = keys;
    action.params.keys = keys;
    const current = workflowRef.current;
    const next = {
      ...current,
      actions: insertActionAfterSelection(current.actions, action, selectedIdRef.current),
    };
    workflowRef.current = next;
    dispatch({ type: "commit", workflow: next });
    selectedIdRef.current = action.id;
    setSelectedId(action.id);
    setStatus(`Added keystroke: ${keys}`);
  }, []);
  const saveAction = useCallback(
    (action: WorkflowAction) => {
      const current = workflowRef.current;
      const exists = current.actions.some((item) => item.id === action.id);
      const actions = exists
        ? current.actions.map((item) => (item.id === action.id ? action : item))
        : insertActionAfterSelection(current.actions, action, selectedIdRef.current);
      const next = { ...current, actions };
      workflowRef.current = next;
      commit(next);
      selectedIdRef.current = action.id;
      setSelectedId(action.id);
      setEditing(undefined);
    },
    [commit],
  );
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const index = workflow.actions.findIndex((action) => action.id === selectedId);
    commit({ ...workflow, actions: workflow.actions.filter((action) => action.id !== selectedId) });
    setSelectedId(workflow.actions[index + 1]?.id ?? workflow.actions[index - 1]?.id);
  }, [commit, selectedId, workflow]);
  const moveSelected = useCallback(
    (direction: -1 | 1) => {
      const index = workflow.actions.findIndex((action) => action.id === selectedId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= workflow.actions.length) return;
      const actions = [...workflow.actions];
      [actions[index], actions[target]] = [actions[target]!, actions[index]!];
      commit({ ...workflow, actions });
    },
    [commit, selectedId, workflow],
  );
  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = structuredClone(selected);
    copy.id = crypto.randomUUID();
    copy.name = `${copy.name} Copy`;
    const index = workflow.actions.indexOf(selected);
    const actions = [...workflow.actions];
    actions.splice(index + 1, 0, copy);
    commit({ ...workflow, actions });
    setSelectedId(copy.id);
  }, [commit, selected, workflow]);

  const startWorkflow = useCallback(async () => {
    const runnable = removeDuplicateRecordedEvents(workflowRef.current);
    if (runnable !== workflowRef.current) {
      workflowRef.current = runnable;
      dispatch({ type: "commit", workflow: runnable });
      setStatus("Removed duplicate recorder events");
    }
    const localIssues = validateWorkflow(runnable);
    let nativeIssues: ValidationIssue[] = [];
    if (isTauri()) {
      try {
        nativeIssues = await backend.validate(runnable);
      } catch (error) {
        setStatus(String(error));
        setRunState("idle");
        void restoreMainWindow();
        return;
      }
    }
    const allIssues = [
      ...localIssues,
      ...nativeIssues.filter(
        (native) =>
          !localIssues.some(
            (local) => local.code === native.code && local.actionIndex === native.actionIndex,
          ),
      ),
    ];
    if (allIssues.length) {
      setIssues(allIssues);
      setRunState("idle");
      void restoreMainWindow();
      return;
    }
    setSelectedId(runnable.actions[0]?.id);
    if (!isTauri()) {
      setStatus("Workflow execution requires the Windows desktop app.");
      setRunState("idle");
      return;
    }
    setRunState("starting");
    setActionStates({});
    setLogs([]);
    setElapsedMs(0);
    setStartedAt(Date.now());
    try {
      await backend.start(structuredClone(runnable));
    } catch (error) {
      setRunState("failed");
      setStatus(String(error));
      setStartedAt(undefined);
      void restoreMainWindow();
    }
  }, []);

  const runControl = useCallback(async () => {
    if (runState === "paused") {
      await backend.resume();
      return;
    }
    if (busy) {
      await backend.pause();
      return;
    }
    await startWorkflow();
  }, [busy, runState, startWorkflow]);

  const stopRun = useCallback(async () => {
    if (launchTimerRef.current !== undefined) {
      window.clearTimeout(launchTimerRef.current);
      launchTimerRef.current = undefined;
      setRunState("idle");
      setStatus("Scheduled start cancelled");
      return;
    }
    if (!isTauri()) return;
    setRunState("stopping");
    await backend.stop();
  }, []);

  const startWorkflowRef = useRef(startWorkflow);
  const stopRunRef = useRef(stopRun);
  startWorkflowRef.current = startWorkflow;
  stopRunRef.current = stopRun;

  const requestWindowClose = useCallback(async () => {
    if (!isTauri()) {
      window.close();
      return;
    }
    try {
      await getCurrentWindow().close();
    } catch (error) {
      setStatus(`Close failed: ${String(error)}`);
    }
  }, []);

  const finishWindowClose = useCallback(async () => {
    allowCloseRef.current = true;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      allowCloseRef.current = false;
      setStatus(`Close failed: ${String(error)}`);
    }
  }, []);

  const saveAndClose = useCallback(async () => {
    if (savingBeforeClose) return;
    setSavingBeforeClose(true);
    const saved = await saveProject();
    setSavingBeforeClose(false);
    if (!saved) {
      setClosePromptOpen(false);
      return;
    }
    setClosePromptOpen(false);
    await finishWindowClose();
  }, [finishWindowClose, saveProject, savingBeforeClose]);

  const discardAndClose = useCallback(async () => {
    localStorage.removeItem("autokeyboard.recovery");
    setRecovery(undefined);
    setClosePromptOpen(false);
    await finishWindowClose();
  }, [finishWindowClose]);

  const handleLaunch = useCallback(async (settings: LaunchSettings) => {
    localStorage.setItem("autokeyboard.launch", JSON.stringify(settings));
    setLaunchSettings(settings);
    if (launchTimerRef.current !== undefined) {
      window.clearTimeout(launchTimerRef.current);
      launchTimerRef.current = undefined;
    }
    if (settings.mode === "hotkey") {
      if (isTauri()) await backend.configureHotkeys(settings.startHotkey, settings.stopHotkey);
      setStatus(
        settings.startHotkey === settings.stopHotkey
          ? `${settings.startHotkey} armed for Start / Stop`
          : `${settings.startHotkey} starts / pauses / resumes, ${settings.stopHotkey} stops`,
      );
    } else {
      if (isTauri()) await backend.configureHotkeys("", "");
      setRunState("starting");
      setStatus(`Workflow will start in ${settings.delaySeconds} second(s)`);
      launchTimerRef.current = window.setTimeout(() => {
        launchTimerRef.current = undefined;
        void startWorkflowRef.current();
      }, settings.delaySeconds * 1_000);
    }
    setLaunchOpen(false);
    await minimizeMainWindow();
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!isTauri()) {
      setStatus("Recording is available in the Windows desktop app.");
      return;
    }
    try {
      if (recording) {
        await backend.recorderStop();
      } else {
        // Native code minimizes first and starts the hook after a native delay.
        // A minimized WebView can suspend JavaScript timers, so no JS wait belongs here.
        await backend.recorderStart();
      }
      setRecording(!recording);
      setStatus(recording ? "Recording stopped" : "Recording clicks and keystrokes…");
    } catch (error) {
      setStatus(String(error));
    }
  }, [recording]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const track = (listener: Promise<() => void>) => {
      void listener.then((unlisten) => {
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      });
    };
    track(
      backend.onGlobalStart(() => {
        if (recordingRef.current) return;
        switch (primaryHotkeyIntent(runStateRef.current)) {
          case "start":
            void startWorkflowRef.current();
            break;
          case "pause":
            void backend.pause().catch((error) => setStatus(String(error)));
            break;
          case "resume":
            void backend.resume().catch((error) => setStatus(String(error)));
            break;
          case "ignore":
            break;
        }
      }),
    );
    track(
      backend.onGlobalToggle(() => {
        if (recordingRef.current) return;
        if (busyRef.current) void stopRunRef.current();
        else void startWorkflowRef.current();
      }),
    );
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const showInfo = useCallback((view: Exclude<InfoView, undefined>) => {
    setInfoView(view);
    if (view === "diagnostics" && isTauri())
      void backend
        .diagnostics()
        .then(setDiagnostics)
        .catch((error) => setDiagnostics({ error: String(error) }));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (recording) {
        if (event.key === "Escape") void toggleRecording();
        return;
      }
      if (editing || issues || infoView || launchOpen) return;
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (busy) {
        if (event.key === "Escape") void stopRun();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(true);
      } else if (event.ctrlKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openProject();
      } else if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void newProject();
      } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: "undo" });
      } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (event.ctrlKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveSelected(-1);
      } else if (event.ctrlKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveSelected(1);
      } else if (!event.repeat && !isModifierKey(event)) {
        const keys = keyboardEventToChord(event);
        if (!keys) return;
        event.preventDefault();
        appendQuickKeystroke(keys);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    busy,
    appendQuickKeystroke,
    duplicateSelected,
    editing,
    infoView,
    issues,
    launchOpen,
    moveSelected,
    newProject,
    openProject,
    saveProject,
    stopRun,
    recording,
    toggleRecording,
  ]);

  const infoContent = useMemo(() => {
    if (infoView === "shortcuts")
      return (
        <dl className="info-list">
          <dt>Ctrl+N / Ctrl+O / Ctrl+S</dt>
          <dd>New / Open / Save</dd>
          <dt>Enter / Delete</dt>
          <dd>Add Enter / Delete as a keystroke instruction</dd>
          <dt>Ctrl+Up / Ctrl+Down</dt>
          <dd>Move selected action</dd>
          <dt>Any normal key</dt>
          <dd>Add it directly as a keystroke instruction while the editor is focused</dd>
          <dt>Ctrl+Alt+Shift+F12</dt>
          <dd>Global emergency stop</dd>
          <dt>
            {launchSettings.startHotkey} / {launchSettings.stopHotkey}
          </dt>
          <dd>Selected global start / stop hotkeys</dd>
          <dt>{launchSettings.startHotkey}</dt>
          <dd>Start, pause, and resume with the same key</dd>
          <dt>Escape</dt>
          <dd>Stop while this window is focused</dd>
        </dl>
      );
    if (infoView === "about")
      return (
        <div className="about">
          <ToolbarIconShim />
          <h2>AutoKeyboard Advanced</h2>
          <p>Version 1.0.10</p>
          <p>A local-first, condition-aware Windows automation utility.</p>
          <p>
            Basic input runs in the native Rust core. Image matching starts the optional worker only
            when required.
          </p>
        </div>
      );
    if (infoView === "diagnostics")
      return (
        <dl className="info-list">
          {Object.entries(diagnostics).map(([key, value]) => (
            <>
              <dt key={`${key}-k`}>{key}</dt>
              <dd key={`${key}-v`}>{value}</dd>
            </>
          ))}
        </dl>
      );
    if (infoView === "logs")
      return (
        <div className="log-view">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>State</th>
                <th>Duration</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, index) => (
                <tr key={`${entry.timestamp}-${index}`}>
                  <td>{new Date(entry.timestamp).toLocaleTimeString()}</td>
                  <td>{entry.actionName ?? "—"}</td>
                  <td>{entry.state}</td>
                  <td>{entry.durationMs ?? "—"}</td>
                  <td>{entry.message ?? entry.result ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p>No run events yet.</p>}
        </div>
      );
    return null;
  }, [diagnostics, infoView, launchSettings.startHotkey, launchSettings.stopHotkey, logs]);

  return (
    <main className="app-shell">
      <MenuBar
        busy={busy || recording}
        selected={Boolean(selected)}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onNew={() => void newProject()}
        onOpen={() => void openProject()}
        onSave={() => void saveProject(true)}
        onSaveAs={() => void saveProject(true)}
        onExit={() => void requestWindowClose()}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onEdit={() => selected && setEditing(selected)}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onMove={moveSelected}
        onAdd={addAction}
        onShow={showInfo}
      />
      <ClassicToolbar
        selected={Boolean(selected)}
        runState={runState}
        recording={recording}
        onNew={() => void newProject()}
        onOpen={() => void openProject()}
        onSave={() => void saveProject(true)}
        onAdd={addAction}
        onMove={moveSelected}
        onDelete={deleteSelected}
        onRunControl={() => {
          if (busy) void runControl();
          else setLaunchOpen(true);
        }}
        onStop={() => void stopRun()}
        onRecord={() => void toggleRecording()}
      />
      <ActionTable
        actions={workflow.actions}
        selectedId={selectedId}
        actionStates={actionStates}
        onSelect={setSelectedId}
        onEdit={(action) => !busy && !recording && setEditing(action)}
      />
      <BottomBar
        repeatTimes={workflow.repeatTimes}
        onRepeatTimes={(repeatTimes) => commit({ ...workflow, repeatTimes })}
        runState={runState}
        status={status}
        elapsedMs={elapsedMs}
      />
      {editing && (
        <ActionDialog
          action={editing}
          actions={workflow.actions}
          onSave={saveAction}
          onCancel={() => setEditing(undefined)}
        />
      )}
      {launchOpen && (
        <LaunchDialog
          initial={launchSettings}
          onLaunch={handleLaunch}
          onCancel={() => setLaunchOpen(false)}
        />
      )}
      {issues && (
        <Modal title="Workflow Validation" wide onCancel={() => setIssues(undefined)}>
          <div className="validation-list">
            <p>The workflow cannot run or save until these problems are fixed:</p>
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const action = workflow.actions.find(
                        (item, row) => item.id === issue.actionId || row + 1 === issue.actionIndex,
                      );
                      if (action) {
                        setSelectedId(action.id);
                        setEditing(action);
                        setIssues(undefined);
                      }
                    }}
                  >
                    Row {issue.actionIndex ?? "project"}: {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
      {infoView && (
        <Modal
          title={
            infoView === "about"
              ? "About"
              : infoView === "logs"
                ? "Run Log"
                : infoView.charAt(0).toUpperCase() + infoView.slice(1)
          }
          wide={infoView === "logs"}
          onCancel={() => setInfoView(undefined)}
        >
          {infoContent}
        </Modal>
      )}
      {recovery && (
        <Modal
          title="Recovery Found"
          submitLabel="Recover"
          cancelLabel="Discard"
          onSubmit={() => {
            dispatch({ type: "replace", workflow: recovery.workflow });
            setSavedSnapshot(JSON.stringify(emptyWorkflow()));
            setStatus(`Recovered autosave from ${new Date(recovery.savedAt).toLocaleString()}`);
            setRecovery(undefined);
          }}
          onCancel={() => {
            localStorage.removeItem("autokeyboard.recovery");
            setRecovery(undefined);
          }}
        >
          <p>
            An unsaved workflow from {new Date(recovery.savedAt).toLocaleString()} was found.
            Recover it or discard the recovery copy.
          </p>
        </Modal>
      )}
      {closePromptOpen && (
        <Modal
          title="Unsaved Changes"
          submitLabel={savingBeforeClose ? "Saving…" : "Save"}
          submitDisabled={savingBeforeClose}
          cancelLabel="Cancel"
          onSubmit={() => void saveAndClose()}
          onCancel={() => {
            if (!savingBeforeClose) setClosePromptOpen(false);
          }}
          extraFooter={
            <button
              type="button"
              disabled={savingBeforeClose}
              onClick={() => void discardAndClose()}
            >
              Don't Save
            </button>
          }
        >
          <p>Save your changes before closing AutoKeyboard Advanced?</p>
          {projectPath && <p>The existing project file will be updated.</p>}
        </Modal>
      )}
    </main>
  );
}

function ToolbarIconShim() {
  return <img className="about-logo" src={premiumIcon} alt="AutoKeyboard Advanced" />;
}
