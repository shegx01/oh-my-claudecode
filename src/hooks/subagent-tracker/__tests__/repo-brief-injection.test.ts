import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { processSubagentStart } from "../index.js";
import {
  buildRepoBriefForSubagent,
  isBriefEligibleAgentType,
  __resetRepoBriefFactCache,
} from "../../repo-brief-hook.js";

describe("repo-brief subagent injection", () => {
  let workdir: string;

  beforeEach(() => {
    __resetRepoBriefFactCache();
    workdir = mkdtempSync(join(tmpdir(), "repo-brief-hook-"));
    writeFileSync(
      join(workdir, "package.json"),
      JSON.stringify({
        name: "fixture",
        scripts: { build: "tsc -b", test: "vitest run", lint: "eslint ." },
      }),
    );
  });

  afterEach(() => {
    __resetRepoBriefFactCache();
    rmSync(workdir, { recursive: true, force: true });
  });

  it("recognizes implementation-class agent types as brief-eligible", () => {
    expect(isBriefEligibleAgentType("executor")).toBe(true);
    expect(isBriefEligibleAgentType("oh-my-claudecode:executor")).toBe(true);
    expect(isBriefEligibleAgentType("git-master")).toBe(true);
    expect(isBriefEligibleAgentType("explore")).toBe(false);
    expect(isBriefEligibleAgentType("planner")).toBe(false);
    expect(isBriefEligibleAgentType(undefined)).toBe(false);
  });

  it("buildRepoBriefForSubagent builds a brief from package.json scripts for an eligible agent", () => {
    const brief = buildRepoBriefForSubagent("executor", workdir, "sess-a");
    expect(brief).not.toBeNull();
    expect(brief!.startsWith("## Repo Brief")).toBe(true);
    expect(brief).toContain("### Commands");
    expect(brief).toContain("npm run build");
    expect(brief).toContain("npm run test");
    expect(brief).toContain("npm run lint");
    expect(brief).toMatch(/never substitutes for reading the code/i);
  });

  it("returns null for ineligible agent types (no brief injected)", () => {
    expect(buildRepoBriefForSubagent("explore", workdir, "sess-b")).toBeNull();
    expect(buildRepoBriefForSubagent("planner", workdir, "sess-b")).toBeNull();
  });

  it("returns null when there are no useful facts to inject", () => {
    const empty = mkdtempSync(join(tmpdir(), "repo-brief-empty-"));
    try {
      expect(buildRepoBriefForSubagent("executor", empty, "sess-c")).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("gathers conventions from a ralph progress.txt Codebase Patterns section", () => {
    writeFileSync(
      join(workdir, "progress.txt"),
      [
        "Started: 2026-07-24",
        "",
        "## Codebase Patterns",
        "- Use camelCase for functions",
        "- Errors surface via Result<T>",
        "---",
      ].join("\n"),
    );
    const brief = buildRepoBriefForSubagent("executor", workdir, "sess-conv");
    expect(brief).toContain("### Conventions");
    expect(brief).toContain("Use camelCase for functions");
    expect(brief).toContain("Errors surface via Result<T>");
  });

  it("injects the ## Repo Brief into the spawned worker's additionalContext (reaches the subagent)", () => {
    const result = processSubagentStart({
      session_id: "sess-inject",
      transcript_path: join(workdir, "transcript.jsonl"),
      cwd: workdir,
      permission_mode: "default",
      hook_event_name: "SubagentStart",
      agent_id: "worker-brief-1",
      agent_type: "oh-my-claudecode:executor",
      prompt: "Implement the change",
      model: "claude-sonnet-4-6",
    });

    const ctx = result.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain("## Repo Brief");
    expect(ctx).toContain("npm run build");
    expect(ctx).toContain("worker-brief-1");
  });

  it("does NOT inject a brief for read-only exploration agents", () => {
    const result = processSubagentStart({
      session_id: "sess-noinject",
      transcript_path: join(workdir, "transcript.jsonl"),
      cwd: workdir,
      permission_mode: "default",
      hook_event_name: "SubagentStart",
      agent_id: "worker-explore-1",
      agent_type: "explore",
      prompt: "Find the callers",
      model: "claude-haiku",
    });

    const ctx = result.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).not.toContain("## Repo Brief");
    expect(ctx).toContain("worker-explore-1");
  });

  it("scans facts at most once per session (fact cache), tolerating later fixture removal", () => {
    const first = buildRepoBriefForSubagent("executor", workdir, "sess-cache");
    expect(first).toContain("npm run build");

    rmSync(join(workdir, "package.json"), { force: true });

    const second = buildRepoBriefForSubagent("executor", workdir, "sess-cache");
    expect(second).toContain("npm run build");
  });

  it("supports nested .omc/progress.txt for conventions", () => {
    mkdirSync(join(workdir, ".omc"), { recursive: true });
    writeFileSync(
      join(workdir, ".omc", "progress.txt"),
      ["## Codebase Facts", "- Prefer explicit return types", "---"].join("\n"),
    );
    const brief = buildRepoBriefForSubagent("executor", workdir, "sess-omc");
    expect(brief).toContain("Prefer explicit return types");
  });
});
