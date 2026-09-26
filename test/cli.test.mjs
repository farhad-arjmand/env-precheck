import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const cli = resolve("bin/env-precheck.mjs");
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "env-precheck-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function run(dir, args = [], env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}
test("CLI defaults, success and no file modification", () =>
  fixture((dir) => {
    writeFileSync(join(dir, ".env.example"), "A=");
    writeFileSync(join(dir, ".env"), "A=SUPERSECRET");
    const r = run(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /PASS/);
    assert.ok(!r.stdout.includes("SUPERSECRET"));
    assert.equal(readFileSync(join(dir, ".env"), "utf8"), "A=SUPERSECRET");
  }));
test("CLI validation failure is JSON and exit 1", () =>
  fixture((dir) => {
    writeFileSync(join(dir, ".env.example"), "# @env type=integer\nA=");
    writeFileSync(join(dir, ".env"), "A=SUPERSECRET");
    const r = run(dir, ["--format", "json"]);
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).status, "fail");
    assert.ok(!(r.stdout + r.stderr).includes("SUPERSECRET"));
  }));
test("CLI missing input exits 2 with a structured report", () =>
  fixture((dir) => {
    const r = run(dir, ["--format", "json"]);
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).issues[0].code, "unreadable_file");
  }));
test("CLI process mode does not require a .env file", () =>
  fixture((dir) => {
    writeFileSync(join(dir, ".env.example"), "ENV_PRECHECK_TEST=");
    assert.equal(
      run(dir, ["--process"], { ENV_PRECHECK_TEST: "good" }).status,
      0,
    );
  }));
test("CLI ordered overlays then process wins", () =>
  fixture((dir) => {
    writeFileSync(
      join(dir, ".env.example"),
      "# @env type=port\nENV_PRECHECK_TEST=",
    );
    writeFileSync(join(dir, "base"), "ENV_PRECHECK_TEST=bad");
    writeFileSync(join(dir, "overlay"), "ENV_PRECHECK_TEST=8080");
    assert.equal(run(dir, ["--env", "base", "--env", "overlay"]).status, 0);
    assert.equal(
      run(dir, ["--env", "base", "--process"], { ENV_PRECHECK_TEST: "9090" })
        .status,
      0,
    );
  }));
test("CLI strict rejects unknown keys", () =>
  fixture((dir) => {
    writeFileSync(join(dir, ".env.example"), "A=");
    writeFileSync(join(dir, ".env"), "A=x\nTYPO=y");
    assert.equal(run(dir, ["--strict"]).status, 1);
  }));
test("CLI argument errors omit untrusted arguments", () =>
  fixture((dir) => {
    for (const args of [
      ["SUPERSECRET"],
      ["--env"],
      ["--format", "SUPERSECRET"],
    ]) {
      const r = run(dir, args);
      assert.equal(r.status, 2);
      assert.ok(!(r.stdout + r.stderr).includes("SUPERSECRET"));
    }
  }));
test("CLI help and version", () =>
  fixture((dir) => {
    assert.equal(run(dir, ["--help"]).status, 0);
    assert.equal(run(dir, ["--version"]).stdout.trim(), "1.0.1");
  }));
test("CLI rejects oversized files and invalid UTF-8", () =>
  fixture((dir) => {
    writeFileSync(join(dir, ".env.example"), "A=");
    writeFileSync(join(dir, ".env"), "A=" + "x".repeat(1048576));
    assert.equal(run(dir).status, 2);
    writeFileSync(join(dir, ".env"), Buffer.from([0xff]));
    assert.equal(run(dir).status, 2);
  }));
test("JSON usage errors do not depend on flag order", () =>
  fixture((dir) => {
    const r = run(dir, ["--bad-flag", "--format", "json"]);
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).issues[0].code, "invalid_usage");
  }));
