// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (event: { preventDefault: () => void }) => void;

const mocks = vi.hoisted(() => ({
  closeHandler: undefined as CloseHandler | undefined,
  closeWindow: vi.fn(async () => undefined),
  saveDialog: vi.fn(async () => "C:\\workflows\\close-test.akx"),
  saveProject: vi.fn(async () => undefined),
  minimizeWindow: vi.fn(async () => undefined),
  recorderStart: vi.fn(async () => undefined),
  unlisten: async () => () => undefined,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mocks.closeWindow,
    minimize: mocks.minimizeWindow,
    onCloseRequested: async (handler: CloseHandler) => {
      mocks.closeHandler = handler;
      return () => undefined;
    },
    setFocus: vi.fn(async () => undefined),
    setTitle: vi.fn(async () => undefined),
    show: vi.fn(async () => undefined),
    unminimize: vi.fn(async () => undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(async () => true),
  open: vi.fn(async () => null),
  save: mocks.saveDialog,
}));

vi.mock("../lib/tauri", () => ({
  isTauri: () => true,
  backend: {
    configureHotkeys: vi.fn(async () => undefined),
    diagnostics: vi.fn(async () => ({})),
    onActionState: mocks.unlisten,
    onGlobalStart: mocks.unlisten,
    onGlobalToggle: mocks.unlisten,
    onRecordedAction: mocks.unlisten,
    onRecorderState: mocks.unlisten,
    onRunLog: mocks.unlisten,
    onRunState: mocks.unlisten,
    openProject: vi.fn(),
    pause: vi.fn(async () => undefined),
    recorderStart: mocks.recorderStart,
    recorderStop: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    saveProject: mocks.saveProject,
    start: vi.fn(async () => "run-id"),
    stop: vi.fn(async () => undefined),
    validate: vi.fn(async () => []),
  },
}));

import { App } from "./App";

async function renderApp() {
  render(<App />);
  await waitFor(() => expect(mocks.closeHandler).toBeTypeOf("function"));
}

async function makeWorkflowDirty(key = "a") {
  fireEvent.keyDown(window, { key, code: `Key${key.toUpperCase()}` });
  await waitFor(() => expect(document.title.startsWith("*")).toBe(true));
}

function requestClose() {
  const preventDefault = vi.fn();
  act(() => mocks.closeHandler?.({ preventDefault }));
  return preventDefault;
}

describe("App close protection", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.closeHandler = undefined;
    mocks.closeWindow.mockClear();
    mocks.saveDialog.mockClear();
    mocks.saveProject.mockClear();
    mocks.minimizeWindow.mockClear();
    mocks.recorderStart.mockClear();
  });

  afterEach(() => cleanup());

  it("lets a clean window close without blocking it", async () => {
    await renderApp();
    const preventDefault = requestClose();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Save your changes before closing AutoKeyboard Advanced?"),
    ).toBeNull();
  });

  it("keeps an unsaved workflow open when Cancel is selected", async () => {
    await renderApp();
    await makeWorkflowDirty();
    const preventDefault = requestClose();
    expect(preventDefault).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.closeWindow).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Save your changes before closing AutoKeyboard Advanced?"),
    ).toBeNull();
  });

  it("closes an unsaved workflow when Don't Save is selected", async () => {
    await renderApp();
    await makeWorkflowDirty("b");
    requestClose();
    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));
    await waitFor(() => expect(mocks.closeWindow).toHaveBeenCalledOnce());
    expect(mocks.saveProject).not.toHaveBeenCalled();
  });

  it("saves an unsaved workflow before closing", async () => {
    await renderApp();
    await makeWorkflowDirty("c");
    requestClose();
    const dialog = screen.getByRole("dialog", { name: "Unsaved Changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.saveProject).toHaveBeenCalledOnce());
    expect(mocks.saveDialog).toHaveBeenCalledOnce();
    expect(mocks.closeWindow).toHaveBeenCalledOnce();
  });

  it("routes File > Exit through the native close request", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("menuitem", { name: "File" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Exit/ }));
    await waitFor(() => expect(mocks.closeWindow).toHaveBeenCalledOnce());
  });

  it("asks for a location on every manual Save click", async () => {
    await renderApp();
    const saveButton = screen.getByRole("button", { name: "Save" });

    fireEvent.click(saveButton);
    await waitFor(() => expect(mocks.saveDialog).toHaveBeenCalledTimes(1));
    fireEvent.click(saveButton);
    await waitFor(() => expect(mocks.saveDialog).toHaveBeenCalledTimes(2));
    expect(mocks.saveProject).toHaveBeenCalledTimes(2);
  });

  it("starts recording without relying on a minimized WebView timer", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Record/ }));

    await waitFor(() => expect(mocks.recorderStart).toHaveBeenCalledOnce());
    expect(mocks.minimizeWindow).not.toHaveBeenCalled();
  });
});
