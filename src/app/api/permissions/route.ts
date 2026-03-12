import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CLAUDE_GLOBAL_DIR, CLAUDE_PROJECT_DIR } from '@/lib/platform';

// ── Helpers ──────────────────────────────────────────────

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getAllowRules(data: Record<string, unknown>): string[] {
  const perms = data.permissions as { allow?: string[] } | undefined;
  return perms?.allow ?? [];
}

function setAllowRules(data: Record<string, unknown>, rules: string[]): Record<string, unknown> {
  const perms = (data.permissions ?? {}) as Record<string, unknown>;
  return { ...data, permissions: { ...perms, allow: rules } };
}

function getDenyRules(data: Record<string, unknown>): string[] {
  const perms = data.permissions as { deny?: string[] } | undefined;
  return perms?.deny ?? [];
}

type Scope = 'global' | 'project' | 'local';

function resolvePath(scope: Scope, projectPath?: string): string | null {
  switch (scope) {
    case 'global':
      return path.join(os.homedir(), CLAUDE_GLOBAL_DIR, 'settings.json');
    case 'project':
      return projectPath ? path.join(projectPath, CLAUDE_PROJECT_DIR, 'settings.json') : null;
    case 'local':
      return projectPath ? path.join(projectPath, CLAUDE_PROJECT_DIR, 'settings.local.json') : null;
  }
}

// ── GET: Read permission rules separated by scope ────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('project_path');

    // Global: ~/.claude-internal/settings.json
    const globalPath = resolvePath('global')!;
    const globalData = readJsonFile(globalPath);
    const globalAllow = getAllowRules(globalData);
    const globalDeny = getDenyRules(globalData);

    // Project: {cwd}/.claude/settings.json
    let projectAllow: string[] = [];
    let projectDeny: string[] = [];
    if (projectPath && path.isAbsolute(projectPath)) {
      const projectSettingsPath = resolvePath('project', projectPath)!;
      const projectData = readJsonFile(projectSettingsPath);
      projectAllow = getAllowRules(projectData);
      projectDeny = getDenyRules(projectData);
    }

    // Local: {cwd}/.claude/settings.local.json
    let localAllow: string[] = [];
    let localDeny: string[] = [];
    if (projectPath && path.isAbsolute(projectPath)) {
      const localSettingsPath = resolvePath('local', projectPath)!;
      const localData = readJsonFile(localSettingsPath);
      localAllow = getAllowRules(localData);
      localDeny = getDenyRules(localData);
    }

    // Legacy merged view for backward compatibility
    const rules = [...new Set([...projectAllow, ...localAllow])];

    return NextResponse.json({
      rules,
      scoped: {
        global: { allow: globalAllow, deny: globalDeny },
        project: { allow: projectAllow, deny: projectDeny },
        local: { allow: localAllow, deny: localDeny },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read permissions' },
      { status: 500 },
    );
  }
}

// ── POST: Add a permission rule to a specific scope ──────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { scope, rule, project_path, type = 'allow' } = body as {
      scope: Scope;
      rule: string;
      project_path?: string;
      type?: 'allow' | 'deny';
    };

    if (!scope || !rule) {
      return NextResponse.json(
        { error: 'scope and rule are required' },
        { status: 400 },
      );
    }

    const filePath = resolvePath(scope, project_path);
    if (!filePath) {
      return NextResponse.json(
        { error: 'project_path is required for project/local scope' },
        { status: 400 },
      );
    }

    const data = readJsonFile(filePath);
    const perms = (data.permissions ?? {}) as Record<string, unknown>;
    const existing = (perms[type] ?? []) as string[];

    if (!existing.includes(rule)) {
      const updated = { ...data, permissions: { ...perms, [type]: [...existing, rule] } };
      writeJsonFile(filePath, updated);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add permission' },
      { status: 500 },
    );
  }
}

// ── DELETE: Remove a permission rule from a specific scope ─

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { scope, rule, project_path, type = 'allow' } = body as {
      scope: Scope;
      rule: string;
      project_path?: string;
      type?: 'allow' | 'deny';
    };

    if (!scope || !rule) {
      return NextResponse.json(
        { error: 'scope and rule are required' },
        { status: 400 },
      );
    }

    const filePath = resolvePath(scope, project_path);
    if (!filePath) {
      return NextResponse.json(
        { error: 'project_path is required for project/local scope' },
        { status: 400 },
      );
    }

    const data = readJsonFile(filePath);
    const perms = (data.permissions ?? {}) as Record<string, unknown>;
    const existing = (perms[type] ?? []) as string[];
    const filtered = existing.filter((r) => r !== rule);

    const updated = { ...data, permissions: { ...perms, [type]: filtered } };
    writeJsonFile(filePath, updated);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove permission' },
      { status: 500 },
    );
  }
}
