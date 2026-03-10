import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Max messages returned per request */
const MAX_MESSAGES = 200;

// ──────────────────────────────────────────────
// Types matching the JSONL schema written by claude-internal
// ──────────────────────────────────────────────

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

interface JournalMessage {
  role?: string;
  content?: ContentBlock[] | string;
}

interface ProgressData {
  type?: string;
  agentId?: string;
  message?: JournalMessage;
}

interface JournalEntry {
  type: string;           // 'user' | 'assistant' | 'progress' | 'file-history-snapshot'
  isSidechain?: boolean;
  agentId?: string;
  message?: JournalMessage;
  data?: ProgressData;
}

// ──────────────────────────────────────────────
// Path helpers
// ──────────────────────────────────────────────

/**
 * Encode a filesystem path to the format claude-internal uses for project dirs:
 * drive letters and separators are replaced with '--'
 * e.g. "D:\VibeCoding\CodePilot" → "D--VibeCoding-CodePilot"
 */
function encodeProjectPath(projectPath: string): string {
  // Normalise to forward slashes, strip leading slash
  const normalised = projectPath.replace(/\\/g, '/').replace(/^\//, '');
  // Replace : and / with --
  return normalised.replace(/:/g, '').replace(/\//g, '-');
}

/**
 * Build the path to the main session JSONL file.
 * ~/.claude-internal/projects/<encoded_cwd>/<sessionId>.jsonl
 */
function buildMainSessionPath(projectPath: string, sessionId: string): string {
  const encoded = encodeProjectPath(projectPath);
  return path.join(os.homedir(), '.claude-internal', 'projects', encoded, `${sessionId}.jsonl`);
}

/**
 * Build the path to a SubAgent's own JSONL file.
 * ~/.claude-internal/projects/<encoded_cwd>/<sessionId>/subagents/agent-<agentId>.jsonl
 */
function buildSubagentPath(projectPath: string, sessionId: string, agentId: string): string {
  const encoded = encodeProjectPath(projectPath);
  return path.join(
    os.homedir(),
    '.claude-internal',
    'projects',
    encoded,
    sessionId,
    'subagents',
    `agent-${agentId}.jsonl`,
  );
}

// ──────────────────────────────────────────────
// Security: only allow reads inside ~/.claude-internal/
// ──────────────────────────────────────────────

function isAllowedPath(resolved: string): boolean {
  const allowed = path.join(os.homedir(), '.claude-internal');
  return resolved === allowed || resolved.startsWith(allowed + path.sep);
}

// ──────────────────────────────────────────────
// JSONL parser helpers
// ──────────────────────────────────────────────

function parseJSONL(raw: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as JournalEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Extract messages for a specific agentId from the MAIN session JSONL.
 * Looks for `type === 'progress'` entries with `data.agentId === agentId`.
 */
function extractAgentMessages(entries: JournalEntry[], agentId: string): JournalMessage[] {
  const messages: JournalMessage[] = [];
  for (const entry of entries) {
    if (
      entry.type === 'progress' &&
      entry.data?.type === 'agent_progress' &&
      entry.data?.agentId === agentId &&
      entry.data?.message
    ) {
      messages.push(entry.data.message);
    }
  }
  return messages;
}

/**
 * Extract all messages from a SubAgent's own JSONL (assistant + user entries only).
 */
function extractSubagentMessages(entries: JournalEntry[]): JournalMessage[] {
  return entries
    .filter((e) => (e.type === 'assistant' || e.type === 'user') && e.message)
    .map((e) => e.message as JournalMessage);
}

// ──────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────

/**
 * GET /api/agent-transcript
 *
 * Query params:
 *   session_id    required  — main session UUID
 *   project_path  required  — working directory (cwd)
 *   agent_id      required  — SubAgent ID (without 'agent-' prefix)
 *   offset        optional  — number of messages already seen (for incremental polling)
 *
 * Strategy:
 *   1. Try main session JSONL, filter progress entries for this agentId  (real-time data)
 *   2. If SubAgent's own file exists (post-stop), prefer that for completeness
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sessionId   = searchParams.get('session_id');
  const projectPath = searchParams.get('project_path');
  const agentId     = searchParams.get('agent_id');
  const offset      = parseInt(searchParams.get('offset') ?? '0', 10);

  if (!sessionId || !projectPath || !agentId) {
    return NextResponse.json(
      { error: 'Missing required params: session_id, project_path, agent_id' },
      { status: 400 },
    );
  }

  // ── Try SubAgent's own transcript first (most complete, available after stop) ──
  const subagentFilePath = buildSubagentPath(projectPath, sessionId, agentId);
  const subagentResolved = path.resolve(subagentFilePath);

  if (isAllowedPath(subagentResolved)) {
    try {
      const stat = fs.statSync(subagentResolved);
      if (stat.isFile()) {
        const raw = fs.readFileSync(subagentResolved, 'utf-8');
        const entries = parseJSONL(raw);
        const messages = extractSubagentMessages(entries);
        const slice = messages.length > MAX_MESSAGES
          ? messages.slice(-MAX_MESSAGES)
          : messages;
        const newMessages = offset > 0 ? slice.slice(offset) : slice;
        return NextResponse.json({
          messages: newMessages,
          total: slice.length,
          source: 'subagent',
        });
      }
    } catch {
      // subagent file not ready yet, fall through to main session
    }
  }

  // ── Fall back to main session JSONL (available during running) ──
  const mainFilePath = buildMainSessionPath(projectPath, sessionId);
  const mainResolved = path.resolve(mainFilePath);

  if (!isAllowedPath(mainResolved)) {
    return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 403 });
  }

  try {
    const stat = fs.statSync(mainResolved);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Session file not found' }, { status: 404 });
  }

  let raw: string;
  try {
    raw = fs.readFileSync(mainResolved, 'utf-8');
  } catch {
    return NextResponse.json({ error: 'Cannot read session file' }, { status: 500 });
  }

  const entries = parseJSONL(raw);
  const messages = extractAgentMessages(entries, agentId);
  const newMessages = offset > 0 ? messages.slice(offset) : messages;

  return NextResponse.json({
    messages: newMessages,
    total: messages.length,
    source: 'main_session',
  });
}
