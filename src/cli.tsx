import React from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App.tsx";

export async function runCLI(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);
  root.render(<App renderer={renderer} />);

  const cleanup = () => {
    try {
      root.unmount();
      renderer.destroy();
    } catch {
      // Ignore cleanup error
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

if (import.meta.main) {
  runCLI().catch((err) => {
    console.error("CLI crashed:", err);
    process.exit(1);
  });
}
