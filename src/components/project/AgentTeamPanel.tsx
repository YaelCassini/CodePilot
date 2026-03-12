"use client";

import { useState, useEffect, useCallback } from "react";
import { CaretDown, CaretRight, SpinnerGap, CheckCircle, XCircle, Brain } from "@/components/ui/icon";
import type { Icon } from "@/components/ui/icon";
import { subscribe, getSnapshot } from "@/lib/stream-session-manager";
import { ToolCallBlock } from "@/components/chat/ToolCallBlock";
import { useTranscript, pairTools, formatDuration } from "@/lib/agent-transcript";
import type { AgentInfo } from "@/types";

interface AgentTeamPanelProps {
  sessionId: string;
}

// ──────────────────────────────────────────────
// Transcript renderer
// ──────────────────────────────────────────────

interface TranscriptViewProps {
  agent: AgentInfo;
}

function TranscriptView({ agent }: TranscriptViewProps) {
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

  return (
    <div className="space-y-1.5 py-1.5">
      {/* Tool calls */}
      {pairs.length > 0 && (
        <div className="space-y-0.5 px-1">
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
        </div>
      )}

      {/* Assistant text blocks */}
      {textBlocks
        .filter((b) => b.role === "assistant" && b.text.trim())
        .map((b, i) => (
          <p
            key={i}
            className="px-2 text-[11px] leading-relaxed text-foreground/75 whitespace-pre-wrap"
          >
            {b.text}
          </p>
        ))}

      {/* Loading / empty states */}
      {loading && !hasContent && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
          <SpinnerGap size={12} className="animate-spin" />
          {isRunning ? "Waiting for output…" : "Loading transcript…"}
        </div>
      )}

      {!loading && !hasContent && !error && (
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          No output yet.
        </p>
      )}

      {error && (
        <p className="px-2 py-1 text-[11px] text-destructive/80">{error}</p>
      )}

      {/* Live indicator */}
      {isRunning && hasContent && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-blue-500/70">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Running…
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Individual agent row (collapsible)
// ──────────────────────────────────────────────

interface AgentRowProps {
  agent: AgentInfo;
}

function AgentRow({ agent }: AgentRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Live elapsed time for running agents
  const [elapsed, setElapsed] = useState<number>(
    agent.status === "running" ? Date.now() - agent.startedAt : 0,
  );
  useEffect(() => {
    if (agent.status !== "running") return;
    const timer = setInterval(() => setElapsed(Date.now() - agent.startedAt), 1000);
    return () => clearInterval(timer);
  }, [agent.status, agent.startedAt]);

  const durationMs =
    agent.status === "running"
      ? elapsed
      : agent.durationMs ??
        (agent.stoppedAt ? agent.stoppedAt - agent.startedAt : undefined);

  // Can expand when we have a transcript source
  const canExpand =
    !!agent.mainSessionId ||
    !!agent.transcriptPath;

  const StatusIcon = () => {
    switch (agent.status) {
      case "running":
        return <SpinnerGap size={12} className="animate-spin text-blue-500 shrink-0" />;
      case "completed":
        return <CheckCircle size={12} className="text-green-500 shrink-0" />;
      case "failed":
        return <XCircle size={12} className="text-red-500 shrink-0" />;
      case "stopped":
        return <XCircle size={12} className="text-yellow-500 shrink-0" />;
      default:
        return <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />;
    }
  };

  return (
    <div className="rounded-md bg-muted/40 overflow-hidden">
      {/* Header row */}
      <button
        disabled={!canExpand}
        onClick={() => canExpand && setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60 transition-colors disabled:cursor-default"
      >
        {/* Chevron */}
        <span className="shrink-0 text-muted-foreground w-3">
          {canExpand ? (
            expanded
              ? <CaretDown size={12} />
              : <CaretRight size={12} />
          ) : null}
        </span>

        <StatusIcon />

        <Brain size={14} className="shrink-0 text-muted-foreground/70" />

        <span className="flex-1 truncate text-xs font-medium text-foreground/80">
          {agent.agentType}
        </span>

        {/* Stats */}
        {agent.status === "running" ? (
          <span className="shrink-0 text-xs text-blue-500">
            {durationMs !== undefined ? formatDuration(durationMs) : "running…"}
          </span>
        ) : (
          <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
            {agent.toolUses !== undefined && agent.toolUses > 0 && (
              <span>{agent.toolUses} tools</span>
            )}
            {agent.totalTokens !== undefined && (
              <span>{agent.totalTokens.toLocaleString()} tok</span>
            )}
            {durationMs !== undefined && (
              <span>{formatDuration(durationMs)}</span>
            )}
          </div>
        )}
      </button>

      {/* Summary line (collapsed, non-running only) */}
      {agent.summary && !expanded && agent.status !== "running" && (
        <p className="px-8 pb-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
          {agent.summary}
        </p>
      )}

      {/* Expanded transcript */}
      {expanded && (
        <div className="border-t border-border/30 px-1 max-h-96 overflow-y-auto">
          <TranscriptView agent={agent} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Panel
// ──────────────────────────────────────────────

export function AgentTeamPanel({ sessionId }: AgentTeamPanelProps) {
  const [agents, setAgents] = useState<AgentInfo[]>(
    () => getSnapshot(sessionId)?.activeAgents ?? [],
  );

  const sync = useCallback(() => {
    setAgents(getSnapshot(sessionId)?.activeAgents ?? []);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    sync();
    return subscribe(sessionId, sync);
  }, [sessionId, sync]);

  if (agents.length === 0) {
    return (
      <p className="py-2 text-[11px] text-muted-foreground">No active agents</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {agents.map((agent) => (
        <AgentRow key={agent.agentId} agent={agent} />
      ))}
    </div>
  );
}
