import React, { useRef, useState } from "react";
import { defaultTextareaKeyBindings, type TextareaRenderable, type KeyBinding } from "@opentui/core";

const composerKeyBindings: KeyBinding[] = [
  ...defaultTextareaKeyBindings.filter(
    (k) => k.name !== "return" && k.name !== "kpenter" && k.name !== "linefeed"
  ),
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
];

export interface ComposerProps {
  sessionId: string;
  providerName: string;
  modelName: string;
  statusText?: string;
  isBusy: boolean;
  onSend: (text: string) => void;
  onInterrupt?: () => void;
}

export function Composer({
  sessionId,
  providerName,
  modelName,
  statusText,
  isBusy,
  onSend,
  onInterrupt,
}: ComposerProps) {
  const textareaRef = useRef<TextareaRenderable>(null);
  const [rows, setRows] = useState(1);

  const handleContentChange = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.editBuffer.getText();
    const lineCount = text.split("\n").length;
    const clamped = Math.min(3, Math.max(1, lineCount));
    if (clamped !== rows) {
      setRows(clamped);
    }
  };

  const handleSubmit = () => {
    if (!textareaRef.current) return;
    const text = textareaRef.current.editBuffer.getText().trim();
    if (text) {
      onSend(text);
      textareaRef.current.editBuffer.setText("");
      setRows(1);
    }
  };

  return (
    <box
      flexDirection="column"
      width="100%"
      borderStyle="rounded"
      borderColor="#444444"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
    >
      <textarea
        ref={textareaRef}
        height={rows}
        placeholder={isBusy ? "Agent is working (Esc to stop)..." : "Type a message or /command..."}
        placeholderColor="#666666"
        keyBindings={composerKeyBindings}
        onContentChange={handleContentChange}
        onSubmit={handleSubmit}
        focused={!isBusy}
      />
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        width="100%"
        paddingTop={0}
        paddingBottom={0}
      >
        <text fg="#777777">
          {statusText ? statusText : `${sessionId} · ${providerName} (${modelName})`}
        </text>
        <box
          borderStyle="rounded"
          borderColor={isBusy ? "#555555" : "green"}
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={isBusy ? onInterrupt : handleSubmit}
        >
          <text fg={isBusy ? "#888888" : "green"}>
            <b>{isBusy ? "Stop [Esc]" : "Send ↵"}</b>
          </text>
        </box>
      </box>
    </box>
  );
}
