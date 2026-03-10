"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Loading02Icon,
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  AiBrain01Icon,
} from "@hugeicons/core-free-icons";
import { subscribe, getSnapshot } from "@/lib/stream-session-manager";
import { ToolCallBlock } from "@/components/chat/ToolCallBlock";
import type { AgentInfo } from "@/types";

interface AgentTeamPanelProps {
  sessionId: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// ──────────────────────────────────────────────
// Transcript types
// ──────────────────────────────────────────────

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

interface TranscriptMsg {
  role?: string;
  content?: ContentBlock[] | string;
}

interface ToolPair {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

// ──────────────────────────────────────────────
// Parse transcript messages into tool pairs + text blocks
// ──────────────────────────────────────────────

function pairTools(messages: TranscriptMsg[]): {
  pairs: ToolPair[];
  textBlocks: { role: string; text: string }[];
} {
  const pairs: ToolPair[] = [];
  const textBlocks: { role: string; text: string }[] = [];
  const useMap = new Map<string, { name: string; input: unknown }>();

  for (const msg of messages) {
    const blocks = Array.isArray(msg.content)
      ? (msg.content as ContentBlock[])
      : typeof msg.content === "string"
      ? [{ type: "text", text: msg.content }]
      : [];

    for (const block of blocks) {
      if (block.type === "text" && block.text) {
        textBlocks.push({ role: msg.role ?? "assistant", text: block.text });
      } else if (block.type === "tool_use" && block.id && block.name) {
        useMap.set(block.id, { name: block.name, input: block.input });
      } else if (block.type === "tool_result" && block.tool_use_id) {
        const use = useMap.get(block.tool_use_id);
        const resultContent =
          typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
            ? (block.content as ContentBlock[])
                .filter((b) => b.type === "text")
                .map((b) => b.text ?? "")
                .join("")
            : "";
        if (use) {
          pairs.push({
            id: block.tool_use_id,
            name: use.name,
            input: use.input,
            result: resultContent,
            isError: block.is_error,
          });
          useMap.delete(block.tool_use_id);
        }
      }
    }
  }

  // Pending tool_uses without result yet
  for (const [id, use] of useMap.entries()) {
    pairs.push({ id, name: use.name, input: use.input });
  }

  return { pairs, textBlocks };
}

// ──────────────────────────────────────────────
// Transcript fetching hook (with incremental polling)
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;

interface UseTranscriptOptions {
  agentId: string;
  mainSessionId?: string;
  projectPath?: string;
  transcriptPath?: string; // fallback: direct file path
  isRunning: boolean;
}

function useTranscript({
  agentId,
  mainSessionId,
  projectPath,
  transcriptPath,
  isRunning,
}: UseTranscriptOptions) {
  const [messages, setMessages] = useState<TranscriptMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback(
    (offset: number): string | null => {
      if (mainSessionId && projectPath) {
        return (
          `/api/agent-transcript` +
          `?session_id=${encodeURIComponent(mainSessionId)}` +
          `&project_path=${encodeURIComponent(projectPath)}` +
          `&agent_id=${encodeURIComponent(agentId)}` +
          `&offset=${offset}`
        );
      }
      if (transcriptPath) {
        return `/api/agent-transcript?path=${encodeURIComponent(transcriptPath)}&offset=${offset}`;
      }
      return null;
    },
    [agentId, mainSessionId, projectPath, transcriptPath],
  );

  const fetchIncremental = useCallback(async () => {
    const url = buildUrl(offsetRef.current);
    if (!url) {
      setLoading(false);
      setError("No transcript source available.");
      return;
    }

    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as {
        messages: TranscriptMsg[];
        total: number;
      };

      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
        offsetRef.current += data.messages.length;
      }
      setLoading(false);
      setError(null);
    } catch (err) {
      setLoading(false);
      setError((err as Error).message ?? "Failed to load transcript");
    }
  }, [buildUrl]);

  useEffect(() => {
    // Reset on agent change
    setMessages([]);
    setLoading(true);
    setError(null);
    offsetRef.current = 0;

    fetchIncremental();

    if (isRunning) {
      const poll = () => {
        timerRef.current = setTimeout(async () => {
          await fetchIncremental();
          poll();
        }, POLL_INTERVAL_MS);
      };
      poll();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [agentId, isRunning, fetchIncremental]);

  // When agent transitions from running → done, do one final fetch
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearTimeout(timerRef.current);
      fetchIncremental();
    }
  }, [isRunning, fetchIncremental]);

  return { messages, loading, error };
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
          <HugeiconsIcon icon={Loading02Icon} className="h-3 w-3 animate-spin" />
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
        return <HugeiconsIcon icon={Loading02Icon} className="h-3 w-3 animate-spin text-blue-500 shrink-0" />;
      case "completed":
        return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-3 w-3 text-green-500 shrink-0" />;
      case "failed":
        return <HugeiconsIcon icon={CancelCircleIcon} className="h-3 w-3 text-red-500 shrink-0" />;
      case "stopped":
        return <HugeiconsIcon icon={CancelCircleIcon} className="h-3 w-3 text-yellow-500 shrink-0" />;
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
              ? <HugeiconsIcon icon={ArrowDown01Icon} className="h-3 w-3" />
              : <HugeiconsIcon icon={ArrowRight01Icon} className="h-3 w-3" />
          ) : null}
        </span>

        <StatusIcon />

        <HugeiconsIcon icon={AiBrain01Icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />

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
