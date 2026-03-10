"use client";

import { useCallback, useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StructureFolderIcon, PanelRightCloseIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePanel } from "@/hooks/usePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { FileTree } from "@/components/project/FileTree";
import { TaskList } from "@/components/project/TaskList";
import { PermissionsPanel } from "@/components/project/PermissionsPanel";
import { AgentTeamPanel } from "@/components/project/AgentTeamPanel";
import { VerticalResizeHandle } from "@/components/layout/VerticalResizeHandle";

// Minimum and maximum heights for each section (px)
const MIN_H = 60;
const DEFAULT_TASKS_H = 160;
const DEFAULT_FILES_H = 300;
const DEFAULT_PERMISSIONS_H = 200;
// Agent Team fills the remaining space (no explicit height)

const LS_TASKS = "codepilot_rightpanel_tasks_h";
const LS_FILES = "codepilot_rightpanel_files_h";
const LS_PERMISSIONS = "codepilot_rightpanel_permissions_h";

interface RightPanelProps {
  width?: number;
}

export function RightPanel({ width }: RightPanelProps) {
  const { panelOpen, setPanelOpen, workingDirectory, sessionId, previewFile, setPreviewFile } = usePanel();
  const { t } = useTranslation();

  const [tasksH, setTasksH] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_TASKS_H;
    return parseInt(localStorage.getItem(LS_TASKS) ?? String(DEFAULT_TASKS_H), 10);
  });
  const [filesH, setFilesH] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_FILES_H;
    return parseInt(localStorage.getItem(LS_FILES) ?? String(DEFAULT_FILES_H), 10);
  });
  const [permissionsH, setPermissionsH] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PERMISSIONS_H;
    return parseInt(localStorage.getItem(LS_PERMISSIONS) ?? String(DEFAULT_PERMISSIONS_H), 10);
  });

  // Persist on change
  useEffect(() => { localStorage.setItem(LS_TASKS, String(tasksH)); }, [tasksH]);
  useEffect(() => { localStorage.setItem(LS_FILES, String(filesH)); }, [filesH]);
  useEffect(() => { localStorage.setItem(LS_PERMISSIONS, String(permissionsH)); }, [permissionsH]);

  const handleTasksResize = useCallback((delta: number) => {
    setTasksH(h => Math.max(MIN_H, h + delta));
  }, []);

  const handleFilesResize = useCallback((delta: number) => {
    setFilesH(h => Math.max(MIN_H, h + delta));
  }, []);

  const handlePermissionsResize = useCallback((delta: number) => {
    setPermissionsH(h => Math.max(MIN_H, h + delta));
  }, []);

  const handleFileAdd = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent("attach-file-to-chat", { detail: { path } }));
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const NON_PREVIEWABLE = new Set([
      "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg", "avif",
      "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv",
      "mp3", "wav", "ogg", "flac", "aac", "wma",
      "zip", "tar", "gz", "rar", "7z", "bz2",
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "exe", "dll", "so", "dylib", "bin", "dmg", "iso",
      "woff", "woff2", "ttf", "otf", "eot",
    ]);
    if (NON_PREVIEWABLE.has(ext)) return;
    setPreviewFile(previewFile === path ? null : path);
  }, [previewFile, setPreviewFile]);

  if (!panelOpen) {
    return (
      <div className="flex flex-col items-center gap-2 bg-background p-2 mt-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen(true)}>
              <HugeiconsIcon icon={StructureFolderIcon} className="h-4 w-4" />
              <span className="sr-only">{t("panel.openPanel")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("panel.openPanel")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <aside
      className="hidden h-full shrink-0 flex-col overflow-hidden bg-background lg:flex"
      style={{ width: width ?? 288 }}
    >
      {/* Header */}
      <div className="flex h-12 mt-5 shrink-0 items-center justify-between px-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("panel.tasks")}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)}>
              <HugeiconsIcon icon={PanelRightCloseIcon} className="h-4 w-4" />
              <span className="sr-only">{t("panel.closePanel")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("panel.closePanel")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Body — three vertically-resizable sections */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">

        {/* ── Tasks ── fixed height, draggable bottom edge */}
        <div
          className="shrink-0 overflow-y-auto px-3 pb-2"
          style={{ height: tasksH }}
        >
          <TaskList sessionId={sessionId} />
        </div>

        {/* Drag handle between Tasks and Files */}
        <VerticalResizeHandle onResize={handleTasksResize} />

        {/* ── Files ── fixed height, draggable bottom edge */}
        <div
          className="shrink-0 overflow-hidden flex flex-col"
          style={{ height: filesH }}
        >
          <div className="px-4 pt-1 pb-1 shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("panel.files")}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileTree
              workingDirectory={workingDirectory}
              onFileSelect={handleFileSelect}
              onFileAdd={handleFileAdd}
            />
          </div>
        </div>

        {/* Drag handle between Files and Permissions */}
        <VerticalResizeHandle onResize={handleFilesResize} />

        {/* ── Permissions ── fixed height, draggable bottom edge */}
        <div
          className="shrink-0 overflow-y-auto px-3 pb-3"
          style={{ height: permissionsH }}
        >
          <div className="py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Permissions
            </span>
          </div>
          <PermissionsPanel sessionId={sessionId} workingDirectory={workingDirectory} />
        </div>

        {/* Drag handle between Permissions and Agent Team */}
        <VerticalResizeHandle onResize={handlePermissionsResize} />

        {/* ── Agent Team ── fills remaining space, scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <div className="py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('panel.agentTeam')}
            </span>
          </div>
          <AgentTeamPanel sessionId={sessionId} />
        </div>

      </div>
    </aside>
  );
}
