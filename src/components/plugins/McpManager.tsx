"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListViewIcon, CodeIcon, Loading02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { McpServerList } from "@/components/plugins/McpServerList";
import { useTranslation } from "@/hooks/useTranslation";
import type { MCPServer } from "@/types";

interface McpManagerProps {
  projectPath?: string;
}

export function McpManager({ projectPath }: McpManagerProps = {}) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<Record<string, MCPServer>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "json">("list");
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'global' | 'project'>('global');

  const fetchServers = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (scope === 'project' && projectPath) {
        params.set('scope', 'project');
        params.set('project_path', projectPath);
      }
      const url = `/api/plugins/mcp${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.mcpServers) {
        setServers(data.mcpServers);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      console.error("Failed to fetch MCP servers:", err);
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  }, [scope, projectPath]);

  useEffect(() => {
    setLoading(true);
    fetchServers();
  }, [fetchServers, scope]);

  const serverCount = Object.keys(servers).length;

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{t('extensions.mcpServers')}</h3>
            {serverCount > 0 && (
              <span className="text-sm text-muted-foreground">
                ({serverCount})
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure MCP servers via <code className="text-xs bg-muted px-1 py-0.5 rounded">claude-internal</code> CLI
          </p>
        </div>
      </div>

      {/* Read-only notice */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 mb-3 text-xs text-muted-foreground">
        <HugeiconsIcon icon={InformationCircleIcon} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          MCP servers are managed by <code className="bg-muted px-1 rounded">claude-internal</code>. This panel is read-only.
          Use <code className="bg-muted px-1 rounded">claude-internal /mcp</code> to add or remove servers.
        </span>
      </div>

      {/* Scope switcher — only shown when project context is available */}
      {projectPath && (
        <div className="flex gap-1 mb-3 rounded-md bg-muted/50 p-0.5 w-fit">
          <button
            onClick={() => setScope('global')}
            className={`px-3 py-1 text-xs rounded-sm transition-colors ${
              scope === 'global'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setScope('project')}
            className={`px-3 py-1 text-xs rounded-sm transition-colors ${
              scope === 'project'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Project
          </button>
        </div>
      )}
      {scope === 'project' && projectPath && (
        <p className="text-[10px] text-muted-foreground mb-2 truncate">
          {projectPath}/.claude/settings.json · ~/.claude-internal/.claude.json
        </p>
      )}
      {scope === 'global' && (
        <p className="text-[10px] text-muted-foreground mb-2">
          ~/.claude-internal/settings.json · ~/.claude-internal/.claude.json
        </p>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 mb-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "json")}>
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <HugeiconsIcon icon={ListViewIcon} className="h-3.5 w-3.5" />
            {t('mcp.listTab')}
          </TabsTrigger>
          <TabsTrigger value="json" className="gap-1.5">
            <HugeiconsIcon icon={CodeIcon} className="h-3.5 w-3.5" />
            {t('mcp.jsonTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <HugeiconsIcon icon={Loading02Icon} className="h-4 w-4 animate-spin" />
              <p className="text-sm">{t('mcp.loadingServers')}</p>
            </div>
          ) : (
            <McpServerList
              servers={servers}
              readOnly
            />
          )}
        </TabsContent>

        <TabsContent value="json" className="mt-4">
          <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs font-mono overflow-auto max-h-[400px] whitespace-pre-wrap">
            {JSON.stringify(servers, null, 2) || '{}'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
