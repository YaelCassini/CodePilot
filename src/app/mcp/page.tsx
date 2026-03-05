'use client';

import { McpManager } from "@/components/plugins/McpManager";
import { useEffect, useState } from "react";

export default function McpPage() {
  const [workingDir, setWorkingDir] = useState<string | undefined>();

  useEffect(() => {
    const wd = localStorage.getItem('last_working_directory') || undefined;
    setWorkingDir(wd);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden p-6 flex flex-col min-h-0">
        <McpManager projectPath={workingDir} />
      </div>
    </div>
  );
}
