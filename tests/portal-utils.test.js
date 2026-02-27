import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadPortalUtils() {
  const scriptPath = path.resolve(process.cwd(), "js/core/utils.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: scriptPath });
  return context.window.PortalUtils;
}

describe("PortalUtils.splitRef", () => {
  const { splitRef } = loadPortalUtils();

  it("splits path and anchor", () => {
    expect(splitRef("docs/readme.md#overview")).toEqual({
      path: "docs/readme.md",
      suffix: "#overview",
    });
  });

  it("splits path and query", () => {
    expect(splitRef("docs/readme.md?download=1")).toEqual({
      path: "docs/readme.md",
      suffix: "?download=1",
    });
  });

  it("unwraps markdown angle-bracket destinations", () => {
    expect(splitRef("<00 📎 Assets/💬 google-forrester.pdf>")).toEqual({
      path: "00 📎 Assets/💬 google-forrester.pdf",
      suffix: "",
    });
  });

  it("unwraps angle-bracket destinations before splitting suffixes", () => {
    expect(splitRef("<00 📎 Assets/💬 google-forrester.pdf#page=2>")).toEqual({
      path: "00 📎 Assets/💬 google-forrester.pdf",
      suffix: "#page=2",
    });
  });
});
