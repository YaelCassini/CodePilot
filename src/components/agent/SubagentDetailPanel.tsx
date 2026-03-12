"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Loading02Icon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ToolCallBlock } from "@/components/chat/ToolCallBlock";
import {
  useTranscript,
  pairTools,
  formatDuration,
} from "@/lib/agent-transcript";
import { useAgentDashboard } from "@/hooks/useAgentDashboard";
import { getAgentDisplayName, getAgentIdParts } from "./AgentOutputWindow";
import type { AgentInfo } from "@/types";

/* ─── Detail transcript view ─── */

function AgentDetailView({ agent }: { agent: AgentInfo }) {
  const isRunning = agent.status === "running";
  const { messages, loading, error } = useTranscript({
    agentId: agent.agentId,
    mainSessionId: agent.mainSessionId,
    projectPath: agent.projectPath,
    transcriptPath: agent.transcriptPath,
    isRunning,
  });

  const { pairs, textBlocks } = pairTools(messages);
  const hasContent = pairs.length > 0 || textBlocks.some((b) => b.text.trim());

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current && isRunning) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isRunning]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      <div className="space-y-2 p-3">
        {agent.summary && (
          <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-foreground/70 leading-relaxed">
            {agent.summary}
          </div>
        )}

        {pairs.map((pair) => (
          <ToolCallBlock
            key={pair.id}
            name={pair.name}
            input={pair.input}
            result={pair.result}
            isError={pair.isError}
            status={
              pair.result !== undefined
                ? pair.isError
                  ? "error"
                  : "success"
                : isRunning
                  ? "running"
                  : "success"
            }
          />
        ))}

        {textBlocks
          .filter((b) => b.role === "assistant" && b.text.trim())
          .map((b, i) => (
            <div
              key={i}
              className="rounded-md bg-muted/20 px-3 py-2 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap"
            >
              {b.text}
            </div>
          ))}

        {loading && !hasContent && (
          <div className="flex items-center gap-2 px-2 py-6 text-xs text-muted-foreground justify-center">
            <HugeiconsIcon
              icon={Loading02Icon}
              className="h-4 w-4 animate-spin"
            />
            {isRunning ? "Waiting for output…" : "Loading transcript…"}
          </div>
        )}

        {!loading && !hasContent && !error && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No output yet.
          </p>
        )}

        {error && (
          <p className="px-2 py-3 text-xs text-destructive/80">{error}</p>
        )}

        {isRunning && hasContent && (
          <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-blue-500/70">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Agent is running…
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Status helpers ─── */

const STATUS_CONF = {
  running: {
    icon: Loading02Icon,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    animate: true,
  },
  completed: {
    icon: CheckmarkCircle02Icon,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    animate: false,
  },
  failed: {
    icon: CancelCircleIcon,
    color: "text-red-400",
    bg: "bg-red-500/10",
    animate: false,
  },
  stopped: {
    icon: CancelCircleIcon,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    animate: false,
  },
} as const;

/* ─── Main Panel ─── */

interface SubagentDetailPanelProps {
  width?: number;
}

export function SubagentDetailPanel({ width }: SubagentDetailPanelProps) {
  const { agents, selectedAgentId, setSelectedAgentId } = useAgentDashboard();

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.agentId === selectedAgentId) ?? null
    : null;

  useEffect(() => {
    if (selectedAgentId && !selectedAgent && agents.length > 0) {
      const running = agents.find((a) => a.status === "running");
      setSelectedAgentId(running?.agentId ?? agents[0].agentId);
    }
  }, [agents, selectedAgent, selectedAgentId, setSelectedAgentId]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!selectedAgent || selectedAgent.status !== "running") return;
    const timer = setInterval(
      () => setElapsed(Date.now() - selectedAgent.startedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [selectedAgent]);

  const durationMs = selectedAgent
    ? selectedAgent.status === "running"
      ? elapsed || Date.now() - selectedAgent.startedAt
      : selectedAgent.durationMs ??
        (selectedAgent.stoppedAt
          ? selectedAgent.stoppedAt - selectedAgent.startedAt
          : undefined)
    : undefined;

  return (
    <aside
      className="hidden h-full shrink-0 flex-col overflow-hidden bg-background lg:flex border-l border-border/40"
      style={{ width: width ?? 360 }}
    >
      {/* ── Title bar ── */}
      <div className="flex h-12 mt-5 shrink-0 items-center justify-between px-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={UserIcon}
            className="h-4 w-4 text-muted-foreground"
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Member Output
          </span>
        </div>
        {selectedAgent && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedAgentId(null)}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {selectedAgent ? (
        <>
          {/* ── Agent identity card ── */}
          <div className="shrink-0 border-b border-border/20 bg-muted/15 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {(() => {
                const c =
                  STATUS_CONF[selectedAgent.status] ?? STATUS_CONF.running;
                return (
                  <span
                    className={`inline-flex items-center justify-center h-6 w-6 rounded-md ${c.bg}`}
                  >
                    <HugeiconsIcon
                      icon={c.icon}
                      className={`h-3.5 w-3.5 ${c.color} ${c.animate ? "animate-spin" : ""}`}
                    />
                  </span>
                );
              })()}
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-foreground truncate">
                  @{getAgentDisplayName(selectedAgent)}
                </span>
                <span className="block text-[10px] font-mono text-muted-foreground/50 truncate">
                  {getAgentIdParts(selectedAgent).displayId}
                </span>
              </div>
              {durationMs !== undefined && (
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {formatDuration(durationMs)}
                </span>
              )}
            </div>

            {selectedAgent.description && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/50">
                {selectedAgent.description}
              </p>
            )}
          </div>

          {/* ── Agent tab switcher ── */}
          {agents.length > 1 && (
            <div className="flex gap-1 px-2 py-1.5 border-b border-border/20 overflow-x-auto shrink-0">
              {agents.map((a) => {
                const c = STATUS_CONF[a.status] ?? STATUS_CONF.running;
                return (
                  <button
                    key={a.agentId}
                    onClick={() => setSelectedAgentId(a.agentId)}
                    className={[
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap",
                      a.agentId === selectedAgentId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <HugeiconsIcon
                      icon={c.icon}
                      className={`h-3 w-3 ${c.color} ${c.animate ? "animate-spin" : ""}`}
                    />
                    {getAgentDisplayName(a)}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Transcript detail ── */}
          <AgentDetailView agent={selectedAgent} />

          {/* ── Stats footer ── */}
          {selectedAgent.status !== "running" &&
            (selectedAgent.toolUses || selectedAgent.totalTokens) && (
              <div className="flex items-center gap-3 px-3 py-2 border-t border-border/20 text-[10px] text-muted-foreground bg-muted/20 shrink-0">
                {selectedAgent.toolUses !== undefined &&
                  selectedAgent.toolUses > 0 && (
                    <span>{selectedAgent.toolUses} tools</span>
                  )}
                {selectedAgent.totalTokens !== undefined && (
                  <span>
                    {selectedAgent.totalTokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
            )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground px-6">
          <HugeiconsIcon
            icon={UserIcon}
            className="h-8 w-8 opacity-15"
          />
          <p className="text-xs text-center leading-relaxed">
            {agents.length > 0
              ? "Select a team member from the dashboard to view their output"
              : "No active team members"}
          </p>
        </div>
      )}
    </aside>
  );
}
