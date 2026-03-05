"use client";

import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { subscribe, getSnapshot } from "@/lib/stream-session-manager";

// All built-in Claude Code tools
const ALL_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "LS",
  "Task",
  "WebFetch",
  "WebSearch",
  "NotebookRead",
  "NotebookEdit",
  "TodoRead",
  "TodoWrite",
];

type ToolPermState = "auto-approve" | "ask" | "block";

interface PermissionsPanelProps {
  sessionId: string;
}

export function PermissionsPanel({ sessionId }: PermissionsPanelProps) {
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [disallowedTools, setDisallowedTools] = useState<string[]>([]);
  const [sessionGrantedTools, setSessionGrantedTools] = useState<string[]>(
    () => getSnapshot(sessionId)?.sessionGrantedTools ?? []
  );
  const [saving, setSaving] = useState(false);

  // Load global skip-permissions setting + per-session tool permissions
  const loadSettings = useCallback(async () => {
    try {
      const [appRes, sessionRes] = await Promise.all([
        fetch("/api/settings/app"),
        fetch(`/api/chat/sessions/${sessionId}`),
      ]);

      if (appRes.ok) {
        const appData = await appRes.json();
        setSkipPermissions(appData.settings?.dangerously_skip_permissions === "true");
      }

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        const session = sessionData.session;
        try {
          setAllowedTools(JSON.parse(session.allowed_tools || "[]"));
        } catch { setAllowedTools([]); }
        try {
          setDisallowedTools(JSON.parse(session.disallowed_tools || "[]"));
        } catch { setDisallowedTools([]); }
      }
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) loadSettings();
  }, [sessionId, loadSettings]);

  // Subscribe to stream-session-manager to track dynamically granted tools
  useEffect(() => {
    if (!sessionId) return;
    const existing = getSnapshot(sessionId);
    if (existing) {
      setSessionGrantedTools(existing.sessionGrantedTools ?? []);
    } else {
      setSessionGrantedTools([]);
    }
    const unsubscribe = subscribe(sessionId, (event) => {
      setSessionGrantedTools(event.snapshot.sessionGrantedTools ?? []);
    });
    return unsubscribe;
  }, [sessionId]);

  const saveToolPermissions = useCallback(async (
    newAllowed: string[],
    newDisallowed: string[],
  ) => {
    setSaving(true);
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowed_tools: newAllowed,
          disallowed_tools: newDisallowed,
        }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [sessionId]);

  const setToolState = useCallback((tool: string, state: ToolPermState) => {
    let newAllowed: string[];
    let newDisallowed: string[];

    switch (state) {
      case "auto-approve":
        newAllowed = [...allowedTools.filter(t => t !== tool), tool];
        newDisallowed = disallowedTools.filter(t => t !== tool);
        break;
      case "ask":
        newAllowed = allowedTools.filter(t => t !== tool);
        newDisallowed = disallowedTools.filter(t => t !== tool);
        break;
      case "block":
        newAllowed = allowedTools.filter(t => t !== tool);
        newDisallowed = [...disallowedTools.filter(t => t !== tool), tool];
        break;
    }

    setAllowedTools(newAllowed);
    setDisallowedTools(newDisallowed);
    saveToolPermissions(newAllowed, newDisallowed);
  }, [allowedTools, disallowedTools, saveToolPermissions]);

  // Auto all for this session — write all tools to DB allowed_tools
  const handleAutoAllSession = useCallback(async () => {
    setAllowedTools(ALL_TOOLS);
    setDisallowedTools([]);
    await saveToolPermissions(ALL_TOOLS, []);
  }, [saveToolPermissions]);

  const handleSkipPermToggle = useCallback(async (checked: boolean) => {
    setSkipPermissions(checked);
    try {
      await fetch("/api/settings/app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { dangerously_skip_permissions: checked ? "true" : "" },
        }),
      });
    } catch {
      // ignore
    }
  }, []);

  if (!sessionId) return null;

  return (
    <div className="space-y-3 text-xs">

      {/* ── Level 1: Global ─────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1 mb-1.5 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Global</span>
          <span className="text-[9px] text-muted-foreground/50 leading-none">· all sessions · persistent</span>
        </div>
        <div
          className={`rounded-md border px-2.5 py-2 transition-colors ${
            skipPermissions
              ? "border-orange-500/40 bg-orange-500/5"
              : "border-border/50"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-foreground/80 leading-tight">Auto-approve all</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                Skip all permission prompts
              </p>
            </div>
            <Switch
              checked={skipPermissions}
              onCheckedChange={handleSkipPermToggle}
              className="shrink-0 scale-75 origin-right"
            />
          </div>
          {skipPermissions && (
            <p className="mt-1.5 text-[10px] text-orange-500 dark:text-orange-400 leading-tight">
              ⚠ All tools execute without confirmation
            </p>
          )}
        </div>
      </div>

      {/* ── Level 2: Session Persistent ─────────────────── */}
      <div className={saving ? "opacity-60 pointer-events-none" : ""}>
        <div className="flex items-center gap-1 mb-1.5 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">This Session</span>
          <span className="text-[9px] text-muted-foreground/50 leading-none">· persistent</span>
        </div>

        {/* Column headers — double as batch action buttons */}
        <div className="grid grid-cols-[1fr_2.5rem_2rem_2.5rem] gap-x-1 items-center mb-1 px-0.5">
          <span className="text-[10px] text-muted-foreground/60">Tool</span>
          <button
            onClick={handleAutoAllSession}
            title="Set ALL tools to Auto for this session"
            className="h-5 rounded text-[9px] font-medium border border-transparent text-muted-foreground/60 hover:text-green-600 dark:hover:text-green-400 hover:border-green-500/30 hover:bg-green-500/10 transition-colors"
          >
            Auto
          </button>
          <button
            onClick={() => { setAllowedTools([]); setDisallowedTools([]); saveToolPermissions([], []); }}
            title="Reset ALL tools to Ask (default)"
            className="h-5 rounded text-[9px] font-medium border border-transparent text-muted-foreground/60 hover:text-foreground hover:border-border hover:bg-muted/60 transition-colors"
          >
            Ask
          </button>
          <button
            onClick={() => { setAllowedTools([]); setDisallowedTools(ALL_TOOLS); saveToolPermissions([], ALL_TOOLS); }}
            title="Block ALL tools for this session"
            className="h-5 rounded text-[9px] font-medium border border-transparent text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
          >
            Block
          </button>
        </div>

        {/* Tool rows */}
        <div className="space-y-0.5">
          {ALL_TOOLS.map((tool) => {
            const isAllowed = allowedTools.includes(tool);
            const isBlocked = disallowedTools.includes(tool);
            const current: ToolPermState = isAllowed
              ? "auto-approve"
              : isBlocked
              ? "block"
              : "ask";

            return (
              <div
                key={tool}
                className="grid grid-cols-[1fr_2.5rem_2rem_2.5rem] gap-x-1 items-center py-0.5 px-0.5 rounded hover:bg-muted/40 transition-colors"
              >
                <span
                  className={`truncate text-[11px] leading-none ${
                    isBlocked
                      ? "text-red-500 dark:text-red-400"
                      : isAllowed
                      ? "text-green-600 dark:text-green-500"
                      : "text-foreground/80"
                  }`}
                >
                  {tool}
                </span>

                {/* Auto button */}
                <button
                  onClick={() =>
                    setToolState(tool, current === "auto-approve" ? "ask" : "auto-approve")
                  }
                  title="Auto: always allow in this session (saved to session)"
                  className={`h-5 rounded text-[9px] font-medium border transition-colors ${
                    current === "auto-approve"
                      ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/40"
                      : "bg-transparent text-muted-foreground/50 border-transparent hover:border-border hover:text-muted-foreground"
                  }`}
                >
                  Auto
                </button>

                {/* Ask button */}
                <button
                  onClick={() => setToolState(tool, "ask")}
                  title="Ask each time"
                  className={`h-5 rounded text-[9px] font-medium border transition-colors ${
                    current === "ask"
                      ? "bg-muted text-foreground border-border"
                      : "bg-transparent text-muted-foreground/50 border-transparent hover:border-border hover:text-muted-foreground"
                  }`}
                >
                  Ask
                </button>

                {/* Block button */}
                <button
                  onClick={() =>
                    setToolState(tool, current === "block" ? "ask" : "block")
                  }
                  title="Block: always deny this tool"
                  className={`h-5 rounded text-[9px] font-medium border transition-colors ${
                    current === "block"
                      ? "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40"
                      : "bg-transparent text-muted-foreground/50 border-transparent hover:border-border hover:text-muted-foreground"
                  }`}
                >
                  Block
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Level 3: Session Ephemeral ───────────────────── */}
      {sessionGrantedTools.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1.5 px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Granted this run</span>
            <span className="text-[9px] text-muted-foreground/50 leading-none">· resets on restart</span>
          </div>
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
            <div className="flex flex-wrap gap-1">
              {sessionGrantedTools.map(tool => (
                <span
                  key={tool}
                  className="rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[9px] px-1.5 py-0.5 border border-blue-500/20 leading-none"
                >
                  {tool}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[9px] text-muted-foreground/60 leading-tight">
              Approved via &quot;Auto this session&quot; in permission prompts
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
