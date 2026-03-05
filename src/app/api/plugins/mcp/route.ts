import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  MCPServerConfig,
  MCPConfigResponse,
  ErrorResponse,
} from '@/types';

// claude-internal stores global settings in ~/.claude-internal/settings.json
function getSettingsPath(): string {
  return path.join(os.homedir(), '.claude-internal', 'settings.json');
}

function getProjectSettingsPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.json');
}

function getProjectSettingsLocalPath(projectPath: string): string {
  return path.join(projectPath, '.claude', 'settings.local.json');
}

// ~/.claude-internal/.claude.json — CLI internal DB.
// Stores project-scoped MCP under: projects[projectPath].mcpServers
function getCliInternalDbPath(): string {
  return path.join(os.homedir(), '.claude-internal', '.claude.json');
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Read MCP servers for a project path from the CLI internal DB.
 * CLI stores project MCPs under: .claude.json → projects[normalizedPath].mcpServers
 * The key may use forward slashes or backslashes, so we normalize both.
 */
function readProjectMcpFromCliDb(projectPath: string): Record<string, MCPServerConfig> {
  const db = readJsonFile(getCliInternalDbPath());
  const projects = (db.projects || {}) as Record<string, { mcpServers?: Record<string, MCPServerConfig> }>;

  // Normalize path separators to try both slash styles
  const normalized = projectPath.replace(/\\/g, '/');
  const withBackslash = projectPath.replace(/\//g, '\\');

  const projectData =
    projects[normalized] ||
    projects[withBackslash] ||
    projects[projectPath];

  return (projectData?.mcpServers || {}) as Record<string, MCPServerConfig>;
}

// Read-only: MCP config is managed exclusively by the claude-internal CLI.
// GUI only displays, never writes.
export async function GET(request: NextRequest): Promise<NextResponse<MCPConfigResponse | ErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'global';
    const projectPath = searchParams.get('project_path');

    if (scope === 'project' && projectPath) {
      if (!path.isAbsolute(projectPath)) {
        return NextResponse.json({ error: 'Invalid project path' }, { status: 400 });
      }

      // Source 1: {project}/.claude/settings.json
      const settings = readJsonFile(getProjectSettingsPath(projectPath));
      // Source 2: {project}/.claude/settings.local.json
      const settingsLocal = readJsonFile(getProjectSettingsLocalPath(projectPath));
      // Source 3: ~/.claude-internal/.claude.json → projects[projectPath].mcpServers
      const cliDbMcp = readProjectMcpFromCliDb(projectPath);

      // Merge all sources: CLI DB is the authoritative store for project MCPs added via CLI
      const mcpServers: Record<string, MCPServerConfig> = {
        ...cliDbMcp,
        ...((settingsLocal.mcpServers || {}) as Record<string, MCPServerConfig>),
        ...((settings.mcpServers || {}) as Record<string, MCPServerConfig>),
      };
      return NextResponse.json({ mcpServers });
    }

    // Global: merge settings.json + top-level mcpServers in .claude.json
    const settings = readJsonFile(getSettingsPath());
    const cliDb = readJsonFile(getCliInternalDbPath());
    const mcpServers: Record<string, MCPServerConfig> = {
      ...((cliDb.mcpServers || {}) as Record<string, MCPServerConfig>),
      ...((settings.mcpServers || {}) as Record<string, MCPServerConfig>),
    };
    return NextResponse.json({ mcpServers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read MCP config' },
      { status: 500 }
    );
  }
}

// Write operations are disabled — use `claude-internal` CLI to manage MCP servers.
export async function PUT(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json(
    { error: 'MCP config is managed by claude-internal CLI. Use `claude-internal` to add/edit servers.' },
    { status: 405 }
  );
}

export async function POST(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json(
    { error: 'MCP config is managed by claude-internal CLI. Use `claude-internal` to add/edit servers.' },
    { status: 405 }
  );
}
