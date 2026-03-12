"use client";

import { useState, useEffect, useRef } from "react";
import { SpinnerGap, CheckCircle, XCircle } from "@/components/ui/icon";
import type { Icon } from "@/components/ui/icon";
import { ToolCallBlock } from "@/components/chat/ToolCallBlock";
import {
  useTranscript,
  pairTools,
  formatDuration,
} from "@/lib/agent-transcript";
import type { AgentInfo } from "@/types";

const FRIENDLY_TYPE_NAMES: Record<string, string> = {
  generalPurpose: "General Agent",
  explore: "Explorer",
  shell: "Shell Runner",
  "browser-use": "Browser",
  task: "Task Agent",
  agent: "Agent",
};

export function getAgentDisplayName(agent: AgentInfo): string {
  const raw = agent.agentType || "agent";
  return FRIENDLY_TYPE_NAMES[raw] ?? raw;
}

export function getAgentIdParts(agent: AgentInfo): {
  teamName: string | null;
  displayId: string;
} {
  if (agent.agentId.includes("@")) {
    const idx = agent.agentId.indexOf("@");
    return {
      teamName: agent.agentId.slice(idx + 1),
      displayId: agent.agentId,
    };
  }
  if (agent.agentId.length > 20) {
    return { teamName: null, displayId: agent.agentId.slice(0, 12) + "…" };
  }
  return { teamName: null, displayId: agent.agentId };
}

const STATUS_CONFIG: Record<string, { icon: Icon; color: string; dot: string; label: string; animate: boolean }> = {
  running: {
    icon: SpinnerGap,
    color: "text-blue-400",
    dot: "bg-blue-500",
    label: "Running",
    animate: true,
  },
  completed: {
    icon: CheckCircle,
    color: "text-emerald-400",
    dot: "bg-emerald-500",
    label: "Done",
    animate: false,
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    dot: "bg-red-500",
    label: "Failed",
    animate: false,
  },
  stopped: {
    icon: XCircle,
    color: "text-amber-400",
    dot: "bg-amber-500",
    label: "Stopped",
    animate: false,
  },
} as const;

interface AgentOutputWindowProps {
  agent: AgentInfo;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function AgentOutputWindow({
  agent,
  isSelected = false,
  onSelect,
}: AgentOutputWindowProps) {
  const isRunning = agent.status === "running";
  const displayName = getAgentDisplayName(agent);
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.running;

  const [elapsed, setElapsed] = useState<number>(
    isRunning ? Date.now() - agent.startedAt : 0,
  );
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(
      () => setElapsed(Date.now() - agent.startedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [isRunning, agent.startedAt]);

  const durationMs = isRunning
    ? elapsed
    : agent.durationMs ??
      (agent.stoppedAt ? agent.stoppedAt - agent.startedAt : undefined);

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
    <div
      className={[
        "flex flex-col w-full min-h-[180px] flex-1 overflow-hidden border-b last:border-b-0 transition-colors",
        isSelected
          ? "bg-blue-500/5 border-b-blue-500/30"
          : "border-b-border/40",
        "bg-background",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/30 shrink-0 cursor-pointer"
        onClick={onSelect}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot} ${cfg.animate ? "animate-pulse" : ""}`}
        />
        <span className="flex-1 truncate text-xs font-semibold text-foreground">
          @{displayName}
        </span>

        {agent.description && (
          <span className="hidden sm:block truncate max-w-[180px] text-[10px] text-muted-foreground/60">
            {agent.description}
          </span>
        )}

        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.color} bg-current/10`}
        >
          <cfg.icon
            size={10}
            className={cfg.animate ? "animate-spin" : ""}
          />
          {cfg.label}
        </span>

        {durationMs !== undefined && (
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* ── Transcript output ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-1.5 p-2">
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
                className="rounded bg-muted/20 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/75 whitespace-pre-wrap"
              >
                {b.text}
              </div>
            ))}

          {loading && !hasContent && (
            <div className="flex items-center gap-1.5 px-2 py-4 text-[11px] text-muted-foreground justify-center">
              <SpinnerGap
                size={14}
                className="animate-spin"
              />
              {isRunning ? "Waiting for output…" : "Loading transcript…"}
            </div>
          )}

          {!loading && !hasContent && !error && (
            <p className="px-2 py-4 text-[11px] text-muted-foreground text-center">
              No output yet.
            </p>
          )}

          {error && (
            <p className="px-2 py-3 text-[11px] text-destructive/80 text-center">
              {error}
            </p>
          )}

          {isRunning && hasContent && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-blue-500/70">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Running…
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
