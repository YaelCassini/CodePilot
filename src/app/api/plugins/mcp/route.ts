import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  MCPServerConfig,
  MCPConfigResponse,
  ErrorResponse,
} from '@/types';

interface SuccessResponse {
  success: boolean;
}

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

// {project}/.mcp.json — standard project-level MCP config (can be committed to git).
// CLI loads this automatically alongside settings files.
function getProjectMcpJsonPath(projectPath: string): string {
  return path.join(projectPath, '.mcp.json');
}

// ~/.claude-internal/.claude.json — CLI internal DB.
// Stores project-scoped MCP under: projects[projectPath].mcpServers
function getCliInternalDbPath(): string {
  return path.join(os.homedir(), '.claude-internal', '.claude.json');
}

// ~/.claude.json — standard Claude config (also checked for MCP servers)
function getUserConfigPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function readSettings(): Record<string, unknown> {
  return readJsonFile(getSettingsPath());
}

function writeSettings(settings: Record<string, unknown>): void {
  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
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

export async function GET(request: NextRequest): Promise<NextResponse<MCPConfigResponse | ErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'global';
    const projectPath = searchParams.get('project_path');

    if (scope === 'project' && projectPath) {
      if (!path.isAbsolute(projectPath)) {
        return NextResponse.json({ error: 'Invalid project path' }, { status: 400 });
      }

      // Source 1: {project}/.mcp.json (standard project MCP config, git-committable)
      const mcpJson = readJsonFile(getProjectMcpJsonPath(projectPath));
      // Source 2: {project}/.claude/settings.json
      const settings = readJsonFile(getProjectSettingsPath(projectPath));
      // Source 3: {project}/.claude/settings.local.json
      const settingsLocal = readJsonFile(getProjectSettingsLocalPath(projectPath));
      // Source 4: ~/.claude-internal/.claude.json → projects[projectPath].mcpServers
      const cliDbMcp = readProjectMcpFromCliDb(projectPath);

      // Merge all sources (higher priority overwrites lower):
      // .mcp.json < .claude.json DB < settings.local.json < settings.json
      const mcpServers: Record<string, MCPServerConfig> = {
        ...((mcpJson.mcpServers || {}) as Record<string, MCPServerConfig>),
        ...cliDbMcp,
        ...((settingsLocal.mcpServers || {}) as Record<string, MCPServerConfig>),
        ...((settings.mcpServers || {}) as Record<string, MCPServerConfig>),
      };
      return NextResponse.json({ mcpServers });
    }

    // Global: read from both ~/.claude-internal/settings.json AND ~/.claude.json
    // Merge them with _source tag so UI knows where each server came from
    const settings = readSettings();
    const userConfig = readJsonFile(getUserConfigPath());
    const settingsServers = (settings.mcpServers || {}) as Record<string, MCPServerConfig>;
    const userConfigServers = (userConfig.mcpServers || {}) as Record<string, MCPServerConfig>;

    // Merge: settings.json takes precedence over ~/.claude.json
    // Tag each server with _source so UI knows where it came from
    const mcpServers: Record<string, MCPServerConfig & { _source?: string }> = {};
    for (const [name, server] of Object.entries(userConfigServers)) {
      mcpServers[name] = { ...server, _source: 'claude.json' };
    }
    for (const [name, server] of Object.entries(settingsServers)) {
      mcpServers[name] = { ...server, _source: 'settings.json' };
    }

    return NextResponse.json({ mcpServers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read MCP config' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const body = await request.json();
    const incoming = body.mcpServers as Record<string, MCPServerConfig & { _source?: string }>;

    // Split incoming servers by source and write to the correct file.
    // Servers without _source or with _source='settings.json' → settings.json
    // Servers with _source='claude.json' → ~/.claude.json
    const forSettings: Record<string, MCPServerConfig> = {};
    const forUserConfig: Record<string, MCPServerConfig> = {};

    for (const [name, server] of Object.entries(incoming)) {
      const { _source, ...cleanServer } = server;
      if (_source === 'claude.json') {
        forUserConfig[name] = cleanServer;
      } else {
        forSettings[name] = cleanServer;
      }
    }

    // Write settings.json
    const settings = readSettings();
    settings.mcpServers = forSettings;
    writeSettings(settings);

    // Write ~/.claude.json (only the mcpServers key, preserve other fields)
    const userConfig = readJsonFile(getUserConfigPath());
    userConfig.mcpServers = forUserConfig;
    const userConfigPath = getUserConfigPath();
    const dir = path.dirname(userConfigPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update MCP config' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const body = await request.json();
    const { name, server } = body as { name: string; server: MCPServerConfig };

    // stdio servers require command; sse/http servers require url
    const isRemote = server?.type === 'sse' || server?.type === 'http';
    if (!name || !server || (!isRemote && !server.command) || (isRemote && !server.url)) {
      return NextResponse.json(
        { error: isRemote ? 'Name and server URL are required' : 'Name and server command are required' },
        { status: 400 }
      );
    }

    // Check both config files for name collision (merged namespace)
    const settings = readSettings();
    const userConfig = readJsonFile(getUserConfigPath());
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    const settingsServers = settings.mcpServers as Record<string, MCPServerConfig>;
    const userConfigServers = (userConfig.mcpServers || {}) as Record<string, MCPServerConfig>;
    if (settingsServers[name] || userConfigServers[name]) {
      return NextResponse.json(
        { error: `MCP server "${name}" already exists` },
        { status: 409 }
      );
    }

    const mcpServers = settingsServers;

    mcpServers[name] = server;
    writeSettings(settings);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add MCP server' },
      { status: 500 }
    );
  }
}
