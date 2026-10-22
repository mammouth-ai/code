import { For } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useThemes } from "../context/theme"
import { compactWordmark, wordmark, wordmarkGradient } from "../logo"

export function Logo() {
  const themes = useThemes()
  const dimensions = useTerminalDimensions()
  return (
    <box>
      <For each={dimensions().height < 12 ? [] : dimensions().width < 74 ? compactWordmark : wordmark}>
        {(line, index) => (
          <text fg={wordmarkGradient[themes.mode()][index()]} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}
