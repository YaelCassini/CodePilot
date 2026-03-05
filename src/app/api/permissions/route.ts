import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

// Read-only: project permission rules from {cwd}/.claude/settings.local.json
// These rules are managed exclusively by the claude-internal CLI.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('project_path');

    if (!projectPath || !path.isAbsolute(projectPath)) {
      return NextResponse.json({ error: 'project_path is required and must be absolute' }, { status: 400 });
    }

    const settingsLocalPath = path.join(projectPath, '.claude', 'settings.local.json');
    const settingsPath = path.join(projectPath, '.claude', 'settings.json');

    const settingsLocal = readJsonFile(settingsLocalPath);
    const settings = readJsonFile(settingsPath);

    // Merge allow rules from both files (settings.json takes precedence)
    const localAllow = ((settingsLocal as { permissions?: { allow?: string[] } }).permissions?.allow) ?? [];
    const settingsAllow = ((settings as { permissions?: { allow?: string[] } }).permissions?.allow) ?? [];

    // Deduplicate, settings.json rules first (higher priority shown first)
    const allRules = [...new Set([...settingsAllow, ...localAllow])];

    return NextResponse.json({ rules: allRules });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read permissions' },
      { status: 500 }
    );
  }
}
