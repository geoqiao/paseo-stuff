import { describe, expect, it } from "vitest";
import {
  githubToolIcon,
  githubToolKind,
  githubToolLabel,
  githubToolSummary,
} from "./github";

describe("GitHub tool presentation", () => {
  it("recognizes direct and namespaced GitHub tools", () => {
    expect(githubToolKind("github_search_repositories")).toBe("search-repositories");
    expect(githubToolKind("mcp__github__search_code")).toBe("search-code");
    expect(githubToolKind("github_pull_request_read")).toBe("pull-request");
    expect(githubToolKind("github_actions_run_trigger")).toBe("actions-run");
    expect(githubToolKind("exa_web_fetch_exa")).toBeNull();
  });

  it("provides labels, icons, and useful summaries", () => {
    expect(githubToolLabel("search-repositories")).toBe("GitHub Repository Search");
    expect(githubToolIcon("pull-request")).toBe("GitPullRequest");
    expect(
      githubToolSummary("pull-request", { owner: "getpaseo", repo: "paseo", pullNumber: 42 }),
    ).toBe("getpaseo/paseo#42");
    expect(githubToolSummary("file", { path: "packages/server/index.ts" })).toBe(
      "packages/server/index.ts",
    );
  });

  it("bounds large search-query normalization without changing the source", () => {
    const query = " ".repeat(720) + "find Paseo plugin docs" + "x".repeat(1_000_000);
    const input = Object.freeze({ query });
    expect(githubToolSummary("search-code", input)).toBeUndefined();
    expect(input.query).toBe(query);
  });

});
