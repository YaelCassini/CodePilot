"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  InformationCircleIcon,
  RefreshIcon,
  Delete01Icon,
  Add01Icon,
  Globe02Icon,
  Folder01Icon,
  UserIcon,
  Timer01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import {
  subscribe,
  getSnapshot,
  revokeSessionTool,
  revokeAllSessionTools,
} from "@/lib/stream-session-manager";

// ── Types ──────────────────────────────────────────────

type PermScope = "global" | "project" | "local";

interface ScopedRules {
  global: { allow: string[]; deny: string[] };
  project: { allow: string[]; deny: string[] };
  local: { allow: string[]; deny: string[] };
}

interface ParsedRule {
  raw: string;
  toolName: string;
  pattern: string | null;
}

// ── Helpers ────────────────────────────────────────────

/** Parse "Bash(git add *)" → { toolName: "Bash", pattern: "git add *" } */
function parseRule(raw: string): ParsedRule {
  const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.+)\)$/);
  if (m) return { raw, toolName: m[1], pattern: m[2] };
  return { raw, toolName: raw, pattern: null };
}

const SCOPE_META: Record<
  PermScope,
  {
    label: string;
    sublabel: string;
    icon: typeof Globe02Icon;
    color: string;
    borderColor: string;
    bgColor: string;
  }
> = {
  global: {
    label: "Global",
    sublabel: "~/.claude-internal/settings.json · all projects",
    icon: Globe02Icon,
    color: "text-purple-500",
    borderColor: "border-purple-500/20",
    bgColor: "bg-purple-500/5",
  },
  project: {
    label: "Project (shared)",
    sublabel: ".claude/settings.json · git-tracked",
    icon: Folder01Icon,
    color: "text-cyan-500",
    borderColor: "border-cyan-500/20",
    bgColor: "bg-cyan-500/5",
  },
  local: {
    label: "Project (local)",
    sublabel: ".claude/settings.local.json · gitignored",
    icon: UserIcon,
    color: "text-green-500",
    borderColor: "border-green-500/20",
    bgColor: "bg-green-500/5",
  },
};

// ── Sub-components ─────────────────────────────────────

interface RuleItemProps {
  rule: ParsedRule;
  type: "allow" | "deny";
  onRemove: () => void;
}

function RuleItem({ rule, type, onRemove }: RuleItemProps) {
  return (
    <div className="group flex items-center gap-1.5 rounded px-2 py-1 border transition-colors hover:bg-muted/30 border-border/30">
      <span
        className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          type === "allow" ? "bg-green-500/70" : "bg-red-500/70"
        }`}
      />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-[10px] font-semibold text-foreground/80">
          {rule.toolName}
        </span>
        {rule.pattern && (
          <span className="font-mono text-[10px] text-muted-foreground ml-1">
            ({rule.pattern})
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 shrink-0 text-muted-foreground/50 hover:text-destructive"
        title="Remove rule"
      >
        <HugeiconsIcon icon={Delete01Icon} className="h-3 w-3" />
      </button>
    </div>
  );
}

interface AddRuleFormProps {
  onAdd: (rule: string) => void;
  onCancel: () => void;
}

function AddRuleForm({ onAdd, onCancel }: AddRuleFormProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1 mt-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Bash(git *)"
        className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      <Button type="submit" variant="ghost" size="icon-sm" disabled={!value.trim()}>
        <HugeiconsIcon icon={Add01Icon} className="h-3 w-3" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
        <HugeiconsIcon icon={Cancel01Icon} className="h-3 w-3" />
      </Button>
    </form>
  );
}

interface ScopeSectionProps {
  scope: PermScope;
  allowRules: string[];
  denyRules: string[];
  projectPath?: string;
  onRefresh: () => void;
}

function ScopeSection({ scope, allowRules, denyRules, projectPath, onRefresh }: ScopeSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingAllow, setAddingAllow] = useState(false);
  const [addingDeny, setAddingDeny] = useState(false);
  const meta = SCOPE_META[scope];
  const total = allowRules.length + denyRules.length;

  const handleAddRule = useCallback(
    async (rule: string, type: "allow" | "deny") => {
      try {
        await fetch("/api/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rule, project_path: projectPath, type }),
        });
        onRefresh();
      } catch {
        // ignore
      }
      if (type === "allow") setAddingAllow(false);
      else setAddingDeny(false);
    },
    [scope, projectPath, onRefresh],
  );

  const handleRemoveRule = useCallback(
    async (rule: string, type: "allow" | "deny") => {
      try {
        await fetch("/api/permissions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, rule, project_path: projectPath, type }),
        });
        onRefresh();
      } catch {
        // ignore
      }
    },
    [scope, projectPath, onRefresh],
  );

  const parsedAllow = allowRules.map(parseRule);
  const parsedDeny = denyRules.map(parseRule);

  return (
    <div className={`rounded-md border ${meta.borderColor} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted/30 ${meta.bgColor}`}
      >
        <HugeiconsIcon
          icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
          className="h-3 w-3 text-muted-foreground shrink-0"
        />
        <HugeiconsIcon icon={meta.icon} className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-foreground/80">{meta.label}</span>
          <span className="ml-1.5 text-[9px] text-muted-foreground/50">{total} rules</span>
        </div>
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2 pt-1 space-y-2">
          {/* Scope description */}
          <p className="text-[9px] text-muted-foreground/50 leading-tight px-0.5">{meta.sublabel}</p>

          {/* Allow rules */}
          {parsedAllow.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5 px-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                  Allow
                </span>
                <span className="text-[9px] text-muted-foreground/40">{parsedAllow.length}</span>
              </div>
              <div className="space-y-0.5">
                {parsedAllow.map((r) => (
                  <RuleItem
                    key={r.raw}
                    rule={r}
                    type="allow"
                    onRemove={() => handleRemoveRule(r.raw, "allow")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Deny rules */}
          {parsedDeny.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-0.5 px-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Deny
                </span>
                <span className="text-[9px] text-muted-foreground/40">{parsedDeny.length}</span>
              </div>
              <div className="space-y-0.5">
                {parsedDeny.map((r) => (
                  <RuleItem
                    key={r.raw}
                    rule={r}
                    type="deny"
                    onRemove={() => handleRemoveRule(r.raw, "deny")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {total === 0 && !addingAllow && !addingDeny && (
            <p className="text-[10px] text-muted-foreground/40 text-center py-1">
              No rules configured
            </p>
          )}

          {/* Add rule forms */}
          {addingAllow && (
            <AddRuleForm
              onAdd={(rule) => handleAddRule(rule, "allow")}
              onCancel={() => setAddingAllow(false)}
            />
          )}
          {addingDeny && (
            <AddRuleForm
              onAdd={(rule) => handleAddRule(rule, "deny")}
              onCancel={() => setAddingDeny(false)}
            />
          )}

          {/* Action buttons */}
          {!addingAllow && !addingDeny && (
            <div className="flex gap-1 pt-0.5">
              <button
                onClick={() => setAddingAllow(true)}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-green-600 dark:text-green-400 hover:bg-green-500/10 transition-colors"
              >
                <HugeiconsIcon icon={Add01Icon} className="h-2.5 w-2.5" />
                Allow
              </button>
              <button
                onClick={() => setAddingDeny(true)}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <HugeiconsIcon icon={Add01Icon} className="h-2.5 w-2.5" />
                Deny
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────

interface PermissionsPanelProps {
  sessionId: string;
  workingDirectory?: string;
}

export function PermissionsPanel({ sessionId, workingDirectory }: PermissionsPanelProps) {
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [scopedRules, setScopedRules] = useState<ScopedRules>({
    global: { allow: [], deny: [] },
    project: { allow: [], deny: [] },
    local: { allow: [], deny: [] },
  });
  const [loadingRules, setLoadingRules] = useState(false);
  const [grantedOnceTools, setGrantedOnceTools] = useState<string[]>(
    () => getSnapshot(sessionId)?.sessionGrantedTools ?? [],
  );

  // Load global skip-permissions setting
  useEffect(() => {
    fetch("/api/settings/app")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setSkipPermissions(data.settings?.dangerously_skip_permissions === "true");
      })
      .catch(() => {});
  }, []);

  // Load permission rules from all scopes
  const loadAllRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const params = workingDirectory
        ? `?project_path=${encodeURIComponent(workingDirectory)}`
        : "";
      const res = await fetch(`/api/permissions${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.scoped) {
          setScopedRules(data.scoped);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingRules(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    loadAllRules();
  }, [loadAllRules]);

  // Subscribe to stream snapshot for session-level permissions
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

  const handleRevokeSessionTool = useCallback(
    (toolName: string) => {
      if (sessionId) revokeSessionTool(sessionId, toolName);
    },
    [sessionId],
  );

  const handleRevokeAllSessionTools = useCallback(() => {
    if (sessionId) revokeAllSessionTools(sessionId);
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <div className="space-y-3 text-xs">
      {/* ── Header with refresh ── */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={InformationCircleIcon} className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Permission Rules
          </span>
        </div>
        <button
          onClick={loadAllRules}
          disabled={loadingRules}
          title="Refresh all rules"
          className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30"
        >
          <HugeiconsIcon icon={RefreshIcon} className={`h-3 w-3 ${loadingRules ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Auto-approve toggle ── */}
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
              Bypass all permission checks
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

      {/* ── Scope sections ── */}

      {/* Global scope */}
      <ScopeSection
        scope="global"
        allowRules={scopedRules.global.allow}
        denyRules={scopedRules.global.deny}
        onRefresh={loadAllRules}
      />

      {/* Project shared scope */}
      {workingDirectory && (
        <ScopeSection
          scope="project"
          allowRules={scopedRules.project.allow}
          denyRules={scopedRules.project.deny}
          projectPath={workingDirectory}
          onRefresh={loadAllRules}
        />
      )}

      {/* Project local scope */}
      {workingDirectory && (
        <ScopeSection
          scope="local"
          allowRules={scopedRules.local.allow}
          denyRules={scopedRules.local.deny}
          projectPath={workingDirectory}
          onRefresh={loadAllRules}
        />
      )}

      {/* ── Session-level permissions ── */}
      {grantedOnceTools.length > 0 && (
        <div className="rounded-md border border-blue-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 bg-blue-500/5">
            <HugeiconsIcon icon={Timer01Icon} className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold text-foreground/80">This Session</span>
              <span className="ml-1.5 text-[9px] text-muted-foreground/50">
                {grantedOnceTools.length} tools · resets on restart
              </span>
            </div>
            <button
              onClick={handleRevokeAllSessionTools}
              className="text-[9px] text-red-500/70 hover:text-red-500 transition-colors"
              title="Revoke all session permissions"
            >
              Revoke all
            </button>
          </div>

          <div className="px-2.5 py-1.5 space-y-0.5">
            {grantedOnceTools.map((tool) => (
              <div
                key={tool}
                className="group flex items-center gap-1.5 rounded px-2 py-1 border border-border/30 hover:bg-muted/30 transition-colors"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/60" />
                <span className="flex-1 font-mono text-[10px] font-semibold text-foreground/70">
                  {tool}
                </span>
                <button
                  onClick={() => handleRevokeSessionTool(tool)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 shrink-0 text-muted-foreground/50 hover:text-destructive"
                  title={`Revoke ${tool}`}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="h-3 w-3" />
                </button>
              </div>
            ))}

            <p className="text-[9px] text-muted-foreground/50 leading-tight pt-1 px-0.5">
              Approved via "Allow Once" in permission prompts
            </p>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-start gap-1 px-0.5 pt-1">
        <HugeiconsIcon icon={InformationCircleIcon} className="h-3 w-3 shrink-0 text-muted-foreground/30 mt-0.5" />
        <div className="text-[9px] text-muted-foreground/40 leading-tight space-y-0.5">
          <p>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500/60 mr-0.5 align-middle" />
            Allow = tool can run without prompting
          </p>
          <p>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500/60 mr-0.5 align-middle" />
            Deny = tool is always blocked
          </p>
          <p>Rule format: <code className="bg-muted px-0.5 rounded">ToolName(pattern)</code></p>
        </div>
      </div>
    </div>
  );
}
