"use client";

import { useState, useRef, useCallback } from "react";
import {
  Folder,
  CaretDown,
  CaretRight,
  Plus,
  FolderOpen,
  UserCircle,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ProjectGroupHeaderProps {
  workingDirectory: string;
  displayName: string;
  isCollapsed: boolean;
  isFolderHovered: boolean;
  isWorkspace: boolean;
  onToggle: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onCreateSession: (e: React.MouseEvent) => void;
  onRename?: (newName: string) => void;
}

export function ProjectGroupHeader({
  workingDirectory,
  displayName,
  isCollapsed,
  isFolderHovered,
  isWorkspace,
  onToggle,
  onMouseEnter,
  onMouseLeave,
  onCreateSession,
  onRename,
}: ProjectGroupHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRenaming = useCallback(() => {
    setRenaming(true);
    setRenameValue(displayName);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayName]);

  const commitRename = useCallback(() => {
    setRenaming(false);
    const trimmed = renameValue.trim();
    onRename?.(trimmed);
  }, [renameValue, onRename]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer select-none transition-colors",
            "hover:bg-accent/50"
          )}
          onClick={() => { if (!renaming) onToggle(); }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (workingDirectory) startRenaming();
          }}
          onContextMenu={(e) => {
            if (workingDirectory) {
              e.preventDefault();
              startRenaming();
            }
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          {isCollapsed ? (
            <CaretRight size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <CaretDown size={14} className="shrink-0 text-muted-foreground" />
          )}
          {isCollapsed ? (
            <Folder size={16} className="shrink-0 text-muted-foreground" />
          ) : (
            <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
          )}
          {renaming ? (
            <input
              ref={inputRef}
              className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-sidebar-foreground outline-none border-b border-primary/50 py-0"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") cancelRename();
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span className="flex-1 truncate text-[13px] font-medium text-sidebar-foreground">
              {displayName}
            </span>
          )}
          {isWorkspace && (
            <UserCircle size={14} className="shrink-0 text-muted-foreground" />
          )}
          {/* New chat in project button (on hover) */}
          {workingDirectory !== "" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground transition-opacity",
                    isFolderHovered ? "opacity-100" : "opacity-0"
                  )}
                  tabIndex={isFolderHovered ? 0 : -1}
                  onClick={onCreateSession}
                >
                  <Plus size={14} />
                  <span className="sr-only">
                    New chat in {displayName}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                New chat in {displayName}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <p className="text-xs break-all">{workingDirectory || 'No Project'}</p>
        {workingDirectory && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Double-click or right-click to rename
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
