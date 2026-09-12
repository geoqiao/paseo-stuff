import type { PluginAgentSnapshot } from "@getpaseo/plugin";
import type { Animation } from "./animation";

export type AgentSignal = Pick<PluginAgentSnapshot, "status" | "requiresAttention" | "attentionReason">;
export interface PetState { animation: Animation; label: string; still: boolean }

export function petState(agent: AgentSignal | null): PetState {
  if (!agent) return { animation: "idle", label: "Not connected", still: true };
  if (agent.status === "closed") return { animation: "idle", label: "Agent closed", still: true };
  if (agent.requiresAttention && agent.attentionReason === "permission") {
    return { animation: "waiting", label: "Needs your input", still: false };
  }
  if (agent.status === "error" || (agent.requiresAttention && agent.attentionReason === "error")) {
    return { animation: "failed", label: "Something went wrong", still: false };
  }
  if (agent.requiresAttention && agent.attentionReason === "finished") {
    return { animation: "review", label: "Ready to review", still: false };
  }
  if (agent.requiresAttention) return { animation: "waiting", label: "Needs attention", still: false };
  if (agent.status === "running") return { animation: "running", label: "Working", still: false };
  if (agent.status === "initializing") return { animation: "running", label: "Starting", still: false };
  return { animation: "idle", label: "Idle", still: false };
}
