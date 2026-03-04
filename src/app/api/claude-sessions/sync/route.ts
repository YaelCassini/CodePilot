import { NextRequest } from 'next/server';
import { parseClaudeSession } from '@/lib/claude-session-parser';
import { getAllSessions, getSession, getMessageCount, addMessage } from '@/lib/db';

interface SyncResult {
  codepilotId: string;
  sdkSessionId: string;
  newMessages: number;
}

async function syncSession(codepilotId: string, sdkSessionId: string): Promise<SyncResult> {
  const parsed = parseClaudeSession(sdkSessionId);
  if (!parsed) {
    return { codepilotId, sdkSessionId, newMessages: 0 };
  }

  const { messages } = parsed;
  const existingCount = getMessageCount(codepilotId);

  if (messages.length <= existingCount) {
    return { codepilotId, sdkSessionId, newMessages: 0 };
  }

  const newMsgs = messages.slice(existingCount);
  for (const msg of newMsgs) {
    const content = msg.hasToolBlocks
      ? JSON.stringify(msg.contentBlocks)
      : msg.content;

    if (content.trim()) {
      addMessage(codepilotId, msg.role, content);
    }
  }

  return { codepilotId, sdkSessionId, newMessages: newMsgs.length };
}

export async function POST(request: NextRequest) {
  try {
    let body: { sessionId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — sync all
    }

    const results: SyncResult[] = [];

    if (body.sessionId) {
      // Sync a single CodePilot session by its CodePilot ID
      const session = getSession(body.sessionId);
      if (!session || !session.sdk_session_id) {
        return Response.json(
          { error: 'Session not found or not imported from Claude Code' },
          { status: 404 },
        );
      }
      const result = await syncSession(session.id, session.sdk_session_id);
      results.push(result);
    } else {
      // Sync all sessions that have an sdk_session_id (i.e. imported from Claude Code CLI)
      const allSessions = getAllSessions();
      const importedSessions = allSessions.filter(s => s.sdk_session_id);

      for (const session of importedSessions) {
        try {
          const result = await syncSession(session.id, session.sdk_session_id);
          results.push(result);
        } catch (err) {
          // Skip sessions that fail to sync — don't abort the whole batch
          console.error(`[sync] Failed to sync session ${session.id}:`, err);
        }
      }
    }

    const total = results.reduce((sum, r) => sum + r.newMessages, 0);
    return Response.json({ synced: results, total });
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('[POST /api/claude-sessions/sync] Error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
