import { compactWordmark, wordmarkGradient } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

export type SessionEpilogue = { readonly title: string; readonly sessionID?: string }

// Printed after the TUI closes.
export function epilogue(input: { readonly session?: SessionEpilogue; readonly updatedVersion?: string }) {
  if (!input.session && !input.updatedVersion) return
  const row = (label: string, value: string) => `  ${dim}${label.padEnd(10, " ")}${reset}${bold}${value}${reset}`
  return [
    ...compactWordmark.map((line, index) => {
      const color =
        wordmarkGradient.dark[index]
          .slice(1)
          .match(/.{2}/g)
          ?.map((value) => Number.parseInt(value, 16)) ?? []
      return `  \x1b[38;2;${color.join(";")}m${line}${reset}`
    }),
    "",
    ...(input.updatedVersion
      ? [`  ${dim}Run ${reset}${bold}mammouth${reset}${dim} to use ${reset}${bold}${input.updatedVersion}${reset}`, ""]
      : []),
    ...(input.session
      ? [row("Session", input.session.title), row("Continue", `mammouth -s ${input.session.sessionID}`), ""]
      : []),
  ].join("\n")
}
