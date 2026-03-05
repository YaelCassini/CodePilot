import { NextResponse } from 'next/server';
import type { ErrorResponse } from '@/types';

// Write operations are disabled — use `claude-internal` CLI to manage MCP servers.
export async function DELETE(): Promise<NextResponse<ErrorResponse>> {
  return NextResponse.json(
    { error: 'MCP config is managed by claude-internal CLI. Use `claude-internal` to remove servers.' },
    { status: 405 }
  );
}
