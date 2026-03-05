"use client";

import { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { subscribe, getSnapshot } from "@/lib/stream-session-manager";

interface PermissionsPanelProps {
  sessionId: string;
  workingDirectory?: string;
}

export function PermissionsPanel({ sessionId, workingDirectory }: PermissionsPanelProps) {
  const [skipPermissions, setSkipPermissions] = useState(false);
  // Rules from {cwd}/.claude/settings.local.json — managed by CLI, read-only in GUI
  const [projectRules, setProjectRules] = useState<string[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  // Tools allowed once this run via "Allow Once" (in-memory, resets on restart)
  const [grantedOnceTools, setGrantedOnceTools] = useState<string[]>(
    () => getSnapshot(sessionId)?.sessionGrantedTools ?? []
  );

  // Load global skip-permissions setting
  useEffect(() => {
    fetch("/api/settings/app")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setSkipPermissions(data.settings?.dangerously_skip_permissions === "true");
      })
      .catch(() => {});
  }, []);

  // Load project permission rules from settings.local.json (read-only)
  const loadProjectRules = useCallback(async () => {
    if (!workingDirectory) return;
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/permissions?project_path=${encodeURIComponent(workingDirectory)}`);
      if (res.ok) {
        const data = await res.json();
        setProjectRules(data.rules ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRules(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    loadProjectRules();
  }, [loadProjectRules]);

  // Subscribe to stream snapshot for "Allow Once" tracking
  useEffect(() => {
    if (!sessionId) return;
    const existing = getSnapshot(sessionId);
    setGrantedOnceTools(existing?.sessionGrantedTools ?? []);
    const unsubscribe = subscribe(sessionId, (event) => {
      setGrantedOnceTools(event.snapshot.sessionGrantedTools ?? []);
    });
    return unsubscribe;
  }, [sessionId]);

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

      {/* ── Global: dangerously_skip_permissions ─────────── */}
      <div>
        <div className="flex items-center gap-1 mb-1.5 px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Global</span>
          <span className="text-[9px] text-muted-foreground/50 leading-none">· all sessions</span>
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

      {/* ── Project Rules: from settings.local.json (CLI-managed, read-only) ── */}
      {workingDirectory && (
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Rules</span>
              <span className="text-[9px] text-muted-foreground/50 leading-none">· persistent · CLI</span>
            </div>
            <button
              onClick={loadProjectRules}
              disabled={loadingRules}
              title="Refresh rules from disk"
              className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30"
            >
              <HugeiconsIcon icon={RefreshIcon} className={`h-3 w-3 ${loadingRules ? "animate-spin" : ""}`} />
            </button>
          </div>

          {projectRules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/50 px-2.5 py-2 text-center">
              <p className="text-[10px] text-muted-foreground/60">
                No rules yet. Use <code className="bg-muted px-0.5 rounded">claude-internal</code> to grant permissions.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {projectRules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded px-2 py-1 bg-green-500/5 border border-green-500/15"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500/60" />
                  <span className="font-mono text-[10px] text-foreground/70 break-all leading-tight">{rule}</span>
                </div>
              ))}
            </div>
          )}

          {/* Read-only notice */}
          <div className="flex items-start gap-1 mt-1.5 px-0.5">
            <HugeiconsIcon icon={InformationCircleIcon} className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />
            <p className="text-[9px] text-muted-foreground/50 leading-tight">
              Written by CLI when you choose &ldquo;Always allow for this project&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* ── Allowed Once This Run (ephemeral, in-memory) ─── */}
      {grantedOnceTools.length > 0 && (
        <div>
          <div className="flex items-center gap-1 mb-1.5 px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allowed This Run</span>
            <span className="text-[9px] text-muted-foreground/50 leading-none">· resets on restart</span>
          </div>
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
            <div className="flex flex-wrap gap-1">
              {grantedOnceTools.map(tool => (
                <span
                  key={tool}
                  className="rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[9px] px-1.5 py-0.5 border border-blue-500/20 leading-none"
                >
                  {tool}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[9px] text-muted-foreground/60 leading-tight">
              Approved via &ldquo;Allow Once&rdquo; in permission prompts
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
