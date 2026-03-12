"use client";

import { createContext, useContext } from "react";
import type { AgentInfo } from "@/types";

export interface AgentDashboardContextValue {
  /** All agents for the current session */
  agents: AgentInfo[];
  /** Currently selected agent for detail view in right panel */
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  /** Whether the agent dashboard is visible (has agents to show) */
  dashboardVisible: boolean;
}

export const AgentDashboardContext =
  createContext<AgentDashboardContextValue | null>(null);

export function useAgentDashboard(): AgentDashboardContextValue {
  const ctx = useContext(AgentDashboardContext);
  if (!ctx) {
    throw new Error(
      "useAgentDashboard must be used within AgentDashboardContext.Provider",
    );
  }
  return ctx;
}
