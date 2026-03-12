"use client";

import { useMemo } from "react";
import { UserCircle, SpinnerGap, CheckCircle, XCircle } from "@/components/ui/icon";
import {
  AgentOutputWindow,
  getAgentIdParts,
} from "./AgentOutputWindow";
import { useAgentDashboard } from "@/hooks/useAgentDashboard";

export function AgentTeamDashboard() {
  const { agents, selectedAgentId, setSelectedAgentId } = useAgentDashboard();

  const sorted = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return b.startedAt - a.startedAt;
    });
  }, [agents]);

  const teamName = useMemo(() => {
    for (const agent of agents) {
      const { teamName: t } = getAgentIdParts(agent);
      if (t) return t;
    }
    return null;
  }, [agents]);

  const runningCount = agents.filter((a) => a.status === "running").length;
  const completedCount = agents.filter((a) => a.status === "completed").length;
  const failedCount = agents.filter((a) => a.status === "failed").length;

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <UserCircle size={40} className="opacity-20" />
        <p className="text-sm">No active team members</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Team Header ── */}
      <div className="shrink-0 border-b border-border/40 bg-background">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <UserCircle size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-bold text-foreground truncate">
              Agent Team{teamName ? `: ${teamName}` : ""}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {agents.length} members
              </span>
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
                  <SpinnerGap size={10} className="animate-spin" />
                  {runningCount} running
                </span>
              )}
              {completedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                  <CheckCircle size={10} />
                  {completedCount} done
                </span>
              )}
              {failedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                  <XCircle size={10} />
                  {failedCount} failed
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Agent output windows — full-width, stacked vertically ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {sorted.map((agent) => (
          <AgentOutputWindow
            key={agent.agentId}
            agent={agent}
            isSelected={selectedAgentId === agent.agentId}
            onSelect={() =>
              setSelectedAgentId(
                selectedAgentId === agent.agentId ? null : agent.agentId,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
