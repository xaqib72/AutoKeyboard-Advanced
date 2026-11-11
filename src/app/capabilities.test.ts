import { describe, expect, it } from "vitest";
import mainCapability from "../../src-tauri/capabilities/main-capability.json";

describe("desktop close permissions", () => {
  it("allows both the requested close and onCloseRequested's internal destroy", () => {
    expect(mainCapability.permissions).toContain("core:window:allow-close");
    expect(mainCapability.permissions).toContain("core:window:allow-destroy");
  });
});
