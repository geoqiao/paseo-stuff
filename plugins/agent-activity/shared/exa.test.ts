import { describe, expect, it } from "vitest";
import { exaToolKind, exaToolSummary } from "./exa";

describe("Exa tool presentation", () => {
  it("recognizes namespaced Exa tools", () => {
    expect(exaToolKind("mcp__exa__web_search_exa")).toBe("search");
    expect(exaToolKind("exa_web_fetch_exa")).toBe("fetch");
    expect(exaToolKind("exa_agent_run")).toBe("agent");
    expect(exaToolKind("mcp__github__search_code")).toBeNull();
  });

  it("summarizes search queries", () => {
    expect(exaToolSummary("search", { query: "find Paseo plugin docs" })).toBe(
      "find Paseo plugin docs",
    );
  });

  it("bounds query and prompt normalization before scanning a large source", () => {
    const large = " ".repeat(720) + "find Paseo plugin docs" + "x".repeat(1_000_000);
    const searchInput = Object.freeze({ query: large });
    const agentInput = Object.freeze({ prompt: large });
    expect(exaToolSummary("search", searchInput)).toBeUndefined();
    expect(exaToolSummary("agent", agentInput)).toBeUndefined();
    expect(searchInput.query).toBe(large);
    expect(agentInput.prompt).toBe(large);
  });

});
