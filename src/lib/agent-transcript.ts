/**
 * Shared agent transcript utilities — parsing, fetching, and types.
 * Extracted from AgentTeamPanel for reuse across AgentOutputWindow,
 * SubagentDetailPanel, and the original AgentTeamPanel.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ──────────────────────────────────────────────
// Transcript types
// ──────────────────────────────────────────────

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface TranscriptMsg {
  role?: string;
  content?: ContentBlock[] | string;
}

export interface ToolPair {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

export interface TextBlock {
  role: string;
  text: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// ──────────────────────────────────────────────
// Parse transcript messages into tool pairs + text blocks
// ──────────────────────────────────────────────

export function pairTools(messages: TranscriptMsg[]): {
  pairs: ToolPair[];
  textBlocks: TextBlock[];
} {
  const pairs: ToolPair[] = [];
  const textBlocks: TextBlock[] = [];
  const useMap = new Map<string, { name: string; input: unknown }>();
  const pairedIds = new Set<string>();

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
        if (!pairedIds.has(block.id)) {
          useMap.set(block.id, { name: block.name, input: block.input });
        }
      } else if (block.type === "tool_result" && block.tool_use_id) {
        if (pairedIds.has(block.tool_use_id)) continue;
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
          pairedIds.add(block.tool_use_id);
        }
      }
    }
  }

  for (const [id, use] of useMap.entries()) {
    pairs.push({ id, name: use.name, input: use.input });
  }

  return { pairs, textBlocks };
}

// ──────────────────────────────────────────────
// Transcript fetching hook (with incremental polling)
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;

export interface UseTranscriptOptions {
  agentId: string;
  mainSessionId?: string;
  projectPath?: string;
  transcriptPath?: string;
  isRunning: boolean;
}

export function useTranscript({
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

  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearTimeout(timerRef.current);
      fetchIncremental();
    }
  }, [isRunning, fetchIncremental]);

  return { messages, loading, error };
}
