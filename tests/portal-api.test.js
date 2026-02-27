import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function loadPortalApi() {
  const scriptPath = path.resolve(process.cwd(), "js/core/api.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = { window: {}, URL, URLSearchParams };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: scriptPath });
  return context.window.PortalApi;
}

describe("PortalApi.toRawUrl", () => {
  const { toRawUrl } = loadPortalApi();

  it("encodes path segments with spaces and emoji", () => {
    const url = toRawUrl(
      {
        owner: "pollyweb-org",
        repo: "pollyweb-docs",
        branch: "main",
        rootPath: "2 🏔️ Landscape/1 💼 Business landscape/10 💬 Chatting landscape",
      },
      "00 📎 Assets/💬 google-forrester.pdf",
    );

    expect(url).toBe(
      "https://raw.githubusercontent.com/pollyweb-org/pollyweb-docs/main/2%20%F0%9F%8F%94%EF%B8%8F%20Landscape/1%20%F0%9F%92%BC%20Business%20landscape/10%20%F0%9F%92%AC%20Chatting%20landscape/00%20%F0%9F%93%8E%20Assets/%F0%9F%92%AC%20google-forrester.pdf",
    );
  });
});
