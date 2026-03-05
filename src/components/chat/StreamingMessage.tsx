'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Message as AIMessage,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { ToolActionsGroup } from '@/components/ai-elements/tool-actions-group';
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { ImageGenConfirmation } from './ImageGenConfirmation';
import { BatchPlanInlinePreview } from './batch-image-gen/BatchPlanInlinePreview';
import { PENDING_KEY, buildReferenceImages } from '@/lib/image-ref-store';
import type { ToolUIPart } from 'ai';
import type { AgentInfo } from '@/types';
import type { PermissionRequestEvent, PlannerOutput } from '@/types';

interface ImageGenRequest {
  prompt: string;
  aspectRatio: string;
  resolution: string;
  referenceImages?: string[];
  useLastGenerated?: boolean;
}

function parseImageGenRequest(text: string): { beforeText: string; request: ImageGenRequest; afterText: string } | null {
  const regex = /```image-gen-request\s*\n?([\s\S]*?)\n?\s*```/;
  const match = text.match(regex);
  if (!match) return null;
  try {
    let raw = match[1].trim();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw);
    } catch {
      // Attempt to fix common model output issues: unescaped quotes in values
      raw = raw.replace(/"prompt"\s*:\s*"([\s\S]*?)"\s*([,}])/g, (_m, val, tail) => {
        const escaped = val.replace(/(?<!\\)"/g, '\\"');
        return `"prompt": "${escaped}"${tail}`;
      });
      json = JSON.parse(raw);
    }
    const beforeText = text.slice(0, match.index).trim();
    const afterText = text.slice((match.index || 0) + match[0].length).trim();
    return {
      beforeText,
      request: {
        prompt: String(json.prompt || ''),
        aspectRatio: String(json.aspectRatio || '1:1'),
        resolution: String(json.resolution || '1K'),
        referenceImages: Array.isArray(json.referenceImages) ? json.referenceImages : undefined,
        useLastGenerated: json.useLastGenerated === true,
      },
      afterText,
    };
  } catch {
    return null;
  }
}

function parseBatchPlan(text: string): { beforeText: string; plan: PlannerOutput; afterText: string } | null {
  const regex = /```batch-plan\s*\n?([\s\S]*?)\n?\s*```/;
  const match = text.match(regex);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]);
    const beforeText = text.slice(0, match.index).trim();
    const afterText = text.slice((match.index || 0) + match[0].length).trim();
    return {
      beforeText,
      plan: {
        summary: json.summary || '',
        items: Array.isArray(json.items) ? json.items.map((item: Record<string, unknown>) => ({
          prompt: String(item.prompt || ''),
          aspectRatio: String(item.aspectRatio || '1:1'),
          resolution: String(item.resolution || '1K'),
          tags: Array.isArray(item.tags) ? item.tags : [],
          sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
        })) : [],
      },
      afterText,
    };
  } catch {
    return null;
  }
}

interface ToolUseInfo {
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultInfo {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  toolUses?: ToolUseInfo[];
  toolResults?: ToolResultInfo[];
  streamingToolOutput?: string;
  statusText?: string;
  pendingPermission?: PermissionRequestEvent | null;
  onPermissionResponse?: (decision: 'allow' | 'allow_session' | 'deny', updatedInput?: Record<string, unknown>, denyMessage?: string, updatedPermissions?: Array<Record<string, unknown>>) => void;
  permissionResolved?: 'allow' | 'deny' | null;
  onForceStop?: () => void;
  streamStartedAt?: number;
  activeAgents?: AgentInfo[];
}

function ElapsedTimer({ startTime }: { startTime?: number }) {
  const [elapsed, setElapsed] = useState(() =>
    startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  );

  useEffect(() => {
    const origin = startTime || Date.now();
    // Sync immediately in case the component was remounted mid-stream
    setElapsed(Math.floor((Date.now() - origin) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - origin) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span className="tabular-nums">
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

function AskUserQuestionUI({
  toolInput,
  onSubmit,
}: {
  toolInput: Record<string, unknown>;
  onSubmit: (decision: 'allow', updatedInput: Record<string, unknown>) => void;
}) {
  const questions = (toolInput.questions || []) as Array<{
    question: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
    header?: string;
  }>;

  // For multi-question, track which question tab is active
  const [activeTab, setActiveTab] = useState(0);

  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [useOther, setUseOther] = useState<Record<string, boolean>>({});

  const buildAnswers = () => {
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      const qIdx = String(i);
      const selected = Array.from(selections[qIdx] || []);
      if (useOther[qIdx] && otherTexts[qIdx]?.trim()) {
        selected.push(otherTexts[qIdx].trim());
      }
      answers[q.question] = selected.join(', ');
    });
    return answers;
  };

  const handleSubmit = () => {
    onSubmit('allow', { questions: toolInput.questions, answers: buildAnswers() });
  };

  const handleOptionClick = (qIdx: string, label: string, multi: boolean) => {
    const newSelections = { ...selections };
    const current = new Set(newSelections[qIdx] || []);
    if (multi) {
      current.has(label) ? current.delete(label) : current.add(label);
      newSelections[qIdx] = current;
      setSelections(newSelections);
      setUseOther((prev) => ({ ...prev, [qIdx]: false }));
    } else {
      // Single select: select and auto-submit immediately
      current.clear();
      current.add(label);
      newSelections[qIdx] = current;
      const answers: Record<string, string> = {};
      questions.forEach((q, i) => {
        const idx = String(i);
        if (idx === qIdx) {
          answers[q.question] = label;
        } else {
          const sel = Array.from(selections[idx] || []);
          if (useOther[idx] && otherTexts[idx]?.trim()) sel.push(otherTexts[idx].trim());
          answers[q.question] = sel.join(', ');
        }
      });
      onSubmit('allow', { questions: toolInput.questions, answers });
    }
  };

  const handleOtherClick = (qIdx: string, multi: boolean) => {
    if (!multi) {
      setSelections((prev) => ({ ...prev, [qIdx]: new Set() }));
    }
    setUseOther((prev) => ({ ...prev, [qIdx]: !prev[qIdx] }));
  };

  const hasAnswer = questions.some((_, i) => {
    const qIdx = String(i);
    return (selections[qIdx]?.size || 0) > 0 || (useOther[qIdx] && otherTexts[qIdx]?.trim());
  });

  const multiQuestion = questions.length > 1;

  return (
    <div className="space-y-3 py-1">
      {/* Tab navigation for multiple questions */}
      {multiQuestion && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const qIdx = String(i);
            const answered = (selections[qIdx]?.size || 0) > 0 || (useOther[qIdx] && !!otherTexts[qIdx]?.trim());
            return (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  activeTab === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${answered ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                {q.header || `Q${i + 1}`}
              </button>
            );
          })}
        </div>
      )}

      {/* Question body */}
      {questions.map((q, i) => {
        if (multiQuestion && i !== activeTab) return null;
        const qIdx = String(i);
        const selected = selections[qIdx] || new Set<string>();
        const totalOptions = q.options.length + 1; // +1 for "Type something"

        return (
          <div key={qIdx} className="space-y-2">
            <p className="text-sm font-medium">{q.question}</p>
            <div className="space-y-1">
              {q.options.map((opt, optIdx) => {
                const isSelected = selected.has(opt.label);
                const num = optIdx + 1;
                return (
                  <button
                    key={opt.label}
                    onClick={() => handleOptionClick(qIdx, opt.label, q.multiSelect)}
                    title={opt.description}
                    className={`flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left ${
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="shrink-0 tabular-nums text-muted-foreground w-4">{num}.</span>
                    <span className="flex-1">
                      {q.multiSelect && (
                        <span className="mr-1">{isSelected ? '☑' : '☐'}</span>
                      )}
                      {opt.label}
                      {opt.description && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{opt.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {/* "Type something." — always the last numbered option */}
              <button
                onClick={() => handleOtherClick(qIdx, q.multiSelect)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left ${
                  useOther[qIdx]
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="shrink-0 tabular-nums text-muted-foreground w-4">{totalOptions}.</span>
                <span>Type something.</span>
              </button>
              {useOther[qIdx] && (
                <div className="pl-6">
                  <input
                    type="text"
                    placeholder="Type your answer..."
                    value={otherTexts[qIdx] || ''}
                    onChange={(e) => setOtherTexts((prev) => ({ ...prev, [qIdx]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && otherTexts[qIdx]?.trim()) {
                        if (!q.multiSelect) {
                          const answers: Record<string, string> = buildAnswers();
                          answers[q.question] = otherTexts[qIdx].trim();
                          onSubmit('allow', { questions: toolInput.questions, answers });
                        }
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Submit — only shown for multiSelect or when "Type something" is active */}
      {(questions.some((_, i) => questions[i].multiSelect) || questions.some((_, i) => useOther[String(i)])) && (
        <button
          onClick={handleSubmit}
          disabled={!hasAnswer}
          className="rounded-lg bg-primary h-8 px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          Submit
        </button>
      )}
    </div>
  );
}

function ExitPlanModeUI({
  toolInput,
  onAllow,
  onDeny,
}: {
  toolInput: Record<string, unknown>;
  onAllow: (updatedPermissions?: Array<Record<string, unknown>>) => void;
  onDeny: (feedback: string) => void;
}) {
  const allowedPrompts = (toolInput.allowedPrompts || []) as Array<{
    tool: string;
    prompt: string;
  }>;
  const planContent = typeof toolInput.plan === 'string' && toolInput.plan.trim()
    ? toolInput.plan.trim()
    : null;

  // Option 4 "Type something" state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const acceptEditsPermission = [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }];

  const options = [
    {
      label: 'Yes, auto-accept edits',
      description: 'Claude will apply file edits without asking for confirmation',
      action: () => onAllow(acceptEditsPermission),
    },
    {
      label: 'Yes, manually approve edits',
      description: 'You will be asked to approve each file edit',
      action: () => onAllow(undefined),
    },
  ];

  const handleFeedbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (feedback.trim()) onDeny(feedback.trim());
    }
  };

  return (
    <div className="space-y-3">
      {/* Plan content */}
      {planContent && (
        <MessageResponse>{planContent}</MessageResponse>
      )}
      {/* Requested permissions */}
      {allowedPrompts.length > 0 && (
        <div className="space-y-1 pl-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Requested permissions:</p>
          <ul className="space-y-0.5">
            {allowedPrompts.map((p, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{p.tool}</span>
                <span>{p.prompt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Options as numbered list */}
      <div className="space-y-1">
        {options.map((opt, idx) => (
          <button
            key={idx}
            onClick={opt.action}
            title={opt.description}
            className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left text-foreground hover:bg-muted"
          >
            <span className="shrink-0 tabular-nums text-muted-foreground w-4">{idx + 1}.</span>
            <span className="flex-1">{opt.label}</span>
          </button>
        ))}
        {/* Option 3: Type feedback (always last) */}
        {!showFeedback ? (
          <button
            onClick={() => setShowFeedback(true)}
            className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors text-left text-foreground hover:bg-muted"
          >
            <span className="shrink-0 tabular-nums text-muted-foreground w-4">{options.length + 1}.</span>
            <span>Type something to tell Claude what to change...</span>
          </button>
        ) : (
          <div className="space-y-2 pl-6">
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleFeedbackKeyDown}
              placeholder="Tell Claude what to change about the plan... (Ctrl+Enter to send)"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowFeedback(false); setFeedback(''); }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => { if (feedback.trim()) onDeny(feedback.trim()); }}
                disabled={!feedback.trim()}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingStatusBar({ statusText, onForceStop, streamStartedAt }: { statusText?: string; onForceStop?: () => void; streamStartedAt?: number }) {
  const displayText = statusText || 'Thinking';

  // Parse elapsed seconds from statusText like "Running bash... (45s)"
  const elapsedMatch = statusText?.match(/\((\d+)s\)/);
  const toolElapsed = elapsedMatch ? parseInt(elapsedMatch[1], 10) : 0;
  const isWarning = toolElapsed >= 60;
  const isCritical = toolElapsed >= 90;

  return (
    <div className="flex items-center gap-3 py-2 px-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className={isCritical ? 'text-red-500' : isWarning ? 'text-yellow-500' : undefined}>
          <Shimmer duration={1.5}>{displayText}</Shimmer>
        </span>
        {isWarning && !isCritical && (
          <span className="text-yellow-500 text-[10px]">Running longer than usual</span>
        )}
        {isCritical && (
          <span className="text-red-500 text-[10px]">Tool may be stuck</span>
        )}
      </div>
      <span className="text-muted-foreground/50">|</span>
      <ElapsedTimer startTime={streamStartedAt} />
      {isCritical && onForceStop && (
        <button
          type="button"
          onClick={onForceStop}
          className="ml-auto rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/20"
        >
          Force stop
        </button>
      )}
    </div>
  );
}

export function StreamingMessage({
  content,
  isStreaming,
  toolUses = [],
  toolResults = [],
  streamingToolOutput,
  statusText,
  pendingPermission,
  onPermissionResponse,
  permissionResolved,
  onForceStop,
  streamStartedAt,
  activeAgents,
}: StreamingMessageProps) {
  const { t } = useTranslation();
  const runningTools = toolUses.filter(
    (tool) => !toolResults.some((r) => r.tool_use_id === tool.id)
  );

  // Determine confirmation state for the AI Elements component
  const getConfirmationState = (): ToolUIPart['state'] => {
    if (permissionResolved) return 'approval-responded';
    if (pendingPermission) return 'approval-requested';
    return 'input-available';
  };

  const getApproval = () => {
    if (!pendingPermission && !permissionResolved) return undefined;
    if (permissionResolved === 'allow') {
      return { id: pendingPermission?.permissionRequestId || '', approved: true as const };
    }
    if (permissionResolved === 'deny') {
      return { id: pendingPermission?.permissionRequestId || '', approved: false as const };
    }
    // Pending - no decision yet
    return { id: pendingPermission?.permissionRequestId || '' };
  };

  const formatToolInput = (input: Record<string, unknown>): string => {
    if (input.command) return String(input.command);
    if (input.file_path) return String(input.file_path);
    if (input.path) return String(input.path);
    return JSON.stringify(input, null, 2);
  };

  // Extract a human-readable summary of the running command
  const getRunningCommandSummary = (): string | undefined => {
    if (runningTools.length === 0) {
      // All tools completed but still streaming — AI is generating text
      if (toolUses.length > 0) return 'Generating response...';
      return undefined;
    }
    const tool = runningTools[runningTools.length - 1];
    const input = tool.input as Record<string, unknown>;
    if (tool.name === 'Bash' && input.command) {
      const cmd = String(input.command);
      return cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
    }
    if (input.file_path) return `${tool.name}: ${String(input.file_path)}`;
    if (input.path) return `${tool.name}: ${String(input.path)}`;
    return `Running ${tool.name}...`;
  };

  return (
    <AIMessage from="assistant">
      <MessageContent>
        {/* Tool calls — compact collapsible group */}
        {toolUses.length > 0 && (
          <ToolActionsGroup
            tools={toolUses.map((tool) => {
              const result = toolResults.find((r) => r.tool_use_id === tool.id);
              return {
                id: tool.id,
                name: tool.name,
                input: tool.input,
                result: result?.content,
                isError: result?.is_error,
              };
            })}
            isStreaming={isStreaming}
            streamingToolOutput={streamingToolOutput}
          />
        )}

        {/* Permission approval — generic confirmation for other tools */}
        {(pendingPermission || permissionResolved) && pendingPermission?.toolName !== 'AskUserQuestion' && pendingPermission?.toolName !== 'ExitPlanMode' && (
          <Confirmation
            approval={getApproval()}
            state={getConfirmationState()}
          >
            <ConfirmationTitle>
              <span className="font-medium">{pendingPermission?.toolName}</span>
              {pendingPermission?.decisionReason && (
                <span className="text-muted-foreground ml-2">
                  — {pendingPermission.decisionReason}
                </span>
              )}
            </ConfirmationTitle>

            {pendingPermission && (
              <div className="mt-1 rounded bg-muted/50 px-3 py-2 font-mono text-xs">
                {formatToolInput(pendingPermission.toolInput)}
              </div>
            )}

            <ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction
                  variant="outline"
                  onClick={() => onPermissionResponse?.('deny')}
                >
                  Deny
                </ConfirmationAction>
                <ConfirmationAction
                  variant="outline"
                  onClick={() => onPermissionResponse?.('allow')}
                >
                  Allow Once
                </ConfirmationAction>
                {pendingPermission && (
                  <ConfirmationAction
                    variant="default"
                    onClick={() => onPermissionResponse?.('allow_session')}
                  >
                    {t('streaming.allowForSession')}
                  </ConfirmationAction>
                )}
              </ConfirmationActions>
            </ConfirmationRequest>

            <ConfirmationAccepted>
              <p className="text-xs text-green-600 dark:text-green-400">{t('streaming.allowed')}</p>
            </ConfirmationAccepted>

            <ConfirmationRejected>
              <p className="text-xs text-red-600 dark:text-red-400">{t('streaming.denied')}</p>
            </ConfirmationRejected>
          </Confirmation>
        )}

        {/* Streaming text content rendered via Streamdown */}
        {content && (() => {
          // Try batch-plan first (Image Agent batch mode)
          const batchPlanResult = parseBatchPlan(content);
          if (batchPlanResult) {
            return (
              <>
                {batchPlanResult.beforeText && <MessageResponse>{batchPlanResult.beforeText}</MessageResponse>}
                <BatchPlanInlinePreview plan={batchPlanResult.plan} messageId={`streaming-${Date.now()}`} />
                {batchPlanResult.afterText && <MessageResponse>{batchPlanResult.afterText}</MessageResponse>}
              </>
            );
          }

          // Try image-gen-request
          const parsed = parseImageGenRequest(content);
          if (parsed) {
            const refs = buildReferenceImages(
              PENDING_KEY,
              parsed.request.useLastGenerated || false,
              parsed.request.referenceImages,
            );
            return (
              <>
                {parsed.beforeText && <MessageResponse>{parsed.beforeText}</MessageResponse>}
                <ImageGenConfirmation
                  initialPrompt={parsed.request.prompt}
                  initialAspectRatio={parsed.request.aspectRatio}
                  initialResolution={parsed.request.resolution}
                  referenceImages={refs.length > 0 ? refs : undefined}
                />
                {parsed.afterText && <MessageResponse>{parsed.afterText}</MessageResponse>}
              </>
            );
          }
          // Strip partial or unparseable code fence blocks to avoid Shiki errors
          if (isStreaming) {
            const hasImageGenBlock = /```image-gen-request/.test(content);
            const hasBatchPlanBlock = /```batch-plan/.test(content);
            const stripped = content
              .replace(/```image-gen-request[\s\S]*$/, '')
              .replace(/```batch-plan[\s\S]*$/, '')
              .trim();
            if (stripped) return <MessageResponse>{stripped}</MessageResponse>;
            // Show shimmer while the structured block is being streamed
            if (hasImageGenBlock || hasBatchPlanBlock) return <Shimmer>{t('streaming.thinking')}</Shimmer>;
            return null;
          }
          const stripped = content
            .replace(/```image-gen-request[\s\S]*?```/g, '')
            .replace(/```batch-plan[\s\S]*?```/g, '')
            .trim();
          return stripped ? <MessageResponse>{stripped}</MessageResponse> : null;
        })()}

        {/* Permission approval — ExitPlanMode gets a dedicated UI, shown AFTER plan text */}
        {pendingPermission?.toolName === 'ExitPlanMode' && !permissionResolved && (
          <ExitPlanModeUI
            toolInput={pendingPermission.toolInput as Record<string, unknown>}
            onAllow={(updatedPermissions) => onPermissionResponse?.('allow', undefined, undefined, updatedPermissions)}
            onDeny={(feedback) => onPermissionResponse?.('deny', undefined, feedback || undefined)}
          />
        )}
        {pendingPermission?.toolName === 'ExitPlanMode' && permissionResolved === 'allow' && (
          <p className="py-1 text-xs text-green-600 dark:text-green-400">Plan approved — executing</p>
        )}
        {pendingPermission?.toolName === 'ExitPlanMode' && permissionResolved === 'deny' && (
          <p className="py-1 text-xs text-red-600 dark:text-red-400">Plan rejected</p>
        )}

        {/* Permission approval — AskUserQuestion rendered after text so it stays in view */}
        {pendingPermission?.toolName === 'AskUserQuestion' && !permissionResolved && (
          <AskUserQuestionUI
            toolInput={pendingPermission.toolInput as Record<string, unknown>}
            onSubmit={(decision, updatedInput) => onPermissionResponse?.(decision, updatedInput)}
          />
        )}
        {pendingPermission?.toolName === 'AskUserQuestion' && permissionResolved && (
          <p className="py-1 text-xs text-green-600 dark:text-green-400">Answer submitted</p>
        )}

        {/* Loading indicator when no content yet */}
        {isStreaming && !content && toolUses.length === 0 && !pendingPermission && (
          <div className="py-2">
            <Shimmer>{t('streaming.thinking')}</Shimmer>
          </div>
        )}

        {/* Agent Team panel — shows active/recently completed sub-agents */}
        {activeAgents && activeAgents.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              Agent Team
            </p>
            {activeAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                {/* Status dot */}
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${agent.status === 'running' ? 'bg-blue-500 animate-pulse' : agent.status === 'failed' ? 'bg-red-500' : 'bg-green-500'}`}
                />
                {/* Agent type / description */}
                <span className="flex-1 truncate text-foreground/80">{agent.agentType}</span>
                {/* Stats when done */}
                {agent.status !== 'running' && agent.totalTokens && (
                  <span className="shrink-0 text-muted-foreground">
                    {agent.totalTokens.toLocaleString()} tokens
                  </span>
                )}
                {/* Duration */}
                {agent.durationMs && (
                  <span className="shrink-0 text-muted-foreground">
                    {(agent.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {/* Running indicator */}
                {agent.status === 'running' && (
                  <span className="shrink-0 text-blue-500">running…</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Status bar during streaming — show permission wait status when awaiting authorization */}
        {isStreaming && <StreamingStatusBar statusText={
          pendingPermission && !permissionResolved
            ? `Waiting for authorization: ${pendingPermission.toolName}`
            : statusText || getRunningCommandSummary()
        } onForceStop={onForceStop} streamStartedAt={streamStartedAt} />}
      </MessageContent>
    </AIMessage>
  );
}
