import React from "react";
import { SyntaxStyle } from "@opentui/core";

const defaultSyntaxStyle = SyntaxStyle.create();

export type ChatTurnItem =
  | { id: string; type: "user"; content: string }
  | { id: string; type: "think"; thought: string; durationMs: number }
  | {
      id: string;
      type: "tool";
      toolName: string;
      args: Record<string, any>;
      result: string;
      durationMs: number;
      outcome?: string;
    }
  | { id: string; type: "agent"; content: string; durationMs?: number }
  | { id: string; type: "error"; message: string }
  | { id: string; type: "system"; content: string };

export interface MessageListProps {
  items: ChatTurnItem[];
}

export function MessageList({ items }: MessageListProps) {
  return (
    <scrollbox flexGrow={1} width="100%" paddingLeft={1} paddingRight={1} paddingTop={1}>
      {items.map((item) => {
        switch (item.type) {
          case "user":
            return (
              <box
                key={item.id}
                backgroundColor="#556B2F"
                paddingLeft={1}
                paddingRight={1}
                paddingTop={0}
                paddingBottom={0}
                marginBottom={1}
                borderStyle="rounded"
                borderColor="#556B2F"
                width="100%"
              >
                <text fg="#ffffff">{item.content}</text>
              </box>
            );

          case "think":
            return (
              <box
                key={item.id}
                borderStyle="rounded"
                borderColor="#8a2be2"
                paddingLeft={1}
                paddingRight={1}
                marginBottom={1}
                width="100%"
              >
                <text fg="#da70d6">
                  <b>🧠 Think ({item.durationMs}ms):</b>
                </text>
                <text fg="#a0a0a0">{item.thought}</text>
              </box>
            );

          case "tool":
            return (
              <box
                key={item.id}
                borderStyle="rounded"
                borderColor="#d97706"
                paddingLeft={1}
                paddingRight={1}
                marginBottom={1}
                width="100%"
              >
                <text fg="#f59e0b">
                  <b>
                    ⚡ Tool: {item.toolName} ({item.durationMs}ms) [{item.outcome || "success"}]
                  </b>
                </text>
                <text fg="#9ca3af">{item.result}</text>
              </box>
            );

          case "agent":
            return (
              <box key={item.id} marginBottom={1} paddingLeft={1} paddingRight={1} width="100%">
                <markdown content={item.content} syntaxStyle={defaultSyntaxStyle} />
              </box>
            );

          case "error":
            return (
              <box
                key={item.id}
                borderStyle="rounded"
                borderColor="red"
                paddingLeft={1}
                paddingRight={1}
                marginBottom={1}
                width="100%"
              >
                <text fg="red">
                  <b>Error: {item.message}</b>
                </text>
              </box>
            );

          case "system":
            return (
              <box key={item.id} marginBottom={1} paddingLeft={1} paddingRight={1} width="100%">
                <text fg="#888888">
                  <i>{item.content}</i>
                </text>
              </box>
            );

          default:
            return null;
        }
      })}
    </scrollbox>
  );
}
