// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageRegionEditor } from "./ConditionEditor";

describe("ImageRegionEditor", () => {
  it("explains and starts four-corner screen capture", () => {
    const onSelect = vi.fn();
    render(
      <ImageRegionEditor
        region={{ x: 10, y: 20, width: 300, height: 200 }}
        onChange={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText(/Click all four corners/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Capture 4 corners on screen" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
