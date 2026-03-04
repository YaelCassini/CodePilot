"use client";

import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";

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

interface PermissionsPanelProps {
  sessionId: string;
}

export function PermissionsPanel({ sessionId }: PermissionsPanelProps) {
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [disallowedTools, setDisallowedTools] = useState<string[]>([]);
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

  const toggleAllowed = useCallback((tool: string, checked: boolean) => {
    let newAllowed: string[];
    let newDisallowed: string[];

    if (checked) {
      // Add to allowed, remove from disallowed (mutually exclusive)
      newAllowed = [...allowedTools.filter(t => t !== tool), tool];
      newDisallowed = disallowedTools.filter(t => t !== tool);
    } else {
      newAllowed = allowedTools.filter(t => t !== tool);
      newDisallowed = disallowedTools;
    }

    setAllowedTools(newAllowed);
    setDisallowedTools(newDisallowed);
    saveToolPermissions(newAllowed, newDisallowed);
  }, [allowedTools, disallowedTools, saveToolPermissions]);

  const toggleDisallowed = useCallback((tool: string, checked: boolean) => {
    let newAllowed: string[];
    let newDisallowed: string[];

    if (checked) {
      // Add to disallowed, remove from allowed (mutually exclusive)
      newDisallowed = [...disallowedTools.filter(t => t !== tool), tool];
      newAllowed = allowedTools.filter(t => t !== tool);
    } else {
      newDisallowed = disallowedTools.filter(t => t !== tool);
      newAllowed = allowedTools;
    }

    setAllowedTools(newAllowed);
    setDisallowedTools(newDisallowed);
    saveToolPermissions(newAllowed, newDisallowed);
  }, [allowedTools, disallowedTools, saveToolPermissions]);

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
      {/* Auto-approve toggle */}
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

      {/* Tool permission lists */}
      <div className={saving ? "opacity-60 pointer-events-none" : ""}>
        {/* Allowed Tools */}
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
            Auto-allow
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {ALL_TOOLS.map((tool) => {
              const isAllowed = allowedTools.includes(tool);
              return (
                <label
                  key={`allow-${tool}`}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={isAllowed}
                    onChange={(e) => toggleAllowed(tool, e.target.checked)}
                    className="h-3 w-3 rounded border-border accent-primary cursor-pointer"
                  />
                  <span
                    className={`truncate leading-none ${
                      isAllowed
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground/70"
                    }`}
                  >
                    {tool}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Disallowed Tools */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
            Block
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {ALL_TOOLS.map((tool) => {
              const isDisallowed = disallowedTools.includes(tool);
              return (
                <label
                  key={`block-${tool}`}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={isDisallowed}
                    onChange={(e) => toggleDisallowed(tool, e.target.checked)}
                    className="h-3 w-3 rounded border-border accent-destructive cursor-pointer"
                  />
                  <span
                    className={`truncate leading-none ${
                      isDisallowed
                        ? "text-destructive"
                        : "text-muted-foreground group-hover:text-foreground/70"
                    }`}
                  >
                    {tool}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
