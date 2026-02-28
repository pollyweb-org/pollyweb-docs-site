#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const auditRun = spawnSync(npmCmd, ["audit", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (!auditRun.stdout || !auditRun.stdout.trim()) {
  console.error("Unable to run npm audit. Push blocked to avoid missing security issues.");
  if (auditRun.stderr) {
    console.error(auditRun.stderr.trim());
  }
  process.exit(2);
}

let auditData;
try {
  auditData = JSON.parse(auditRun.stdout);
} catch (error) {
  console.error("Unable to parse npm audit output. Push blocked.");
  if (auditRun.stderr) {
    console.error(auditRun.stderr.trim());
  }
  process.exit(2);
}

const vulnerabilities = auditData.metadata?.vulnerabilities ?? {};
const totalVulnerabilities = Object.values(vulnerabilities).reduce(
  (sum, count) => sum + Number(count || 0),
  0
);

if (totalVulnerabilities > 0) {
  console.error("Security issues are pending. Push blocked.");
  console.error(
    `Found ${totalVulnerabilities} issue(s): ` +
      `critical=${vulnerabilities.critical || 0}, ` +
      `high=${vulnerabilities.high || 0}, ` +
      `moderate=${vulnerabilities.moderate || 0}, ` +
      `low=${vulnerabilities.low || 0}, ` +
      `info=${vulnerabilities.info || 0}`
  );
  console.error("Resolve them with `npm audit fix` (or equivalent) before pushing.");
  console.error("Use SKIP_SECURITY_PUSH_CHECK=1 git push only for emergency overrides.");
  process.exit(1);
}

console.log("No pending npm security issues.");
