import { compactWordmark, wordmarkGradient } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

export function sessionEpilogue(input: { title: string; sessionID?: string; mode?: "dark" | "light" }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...compactWordmark.map((line, index) => {
      const color =
        wordmarkGradient[input.mode ?? "dark"][index]
          .slice(1)
          .match(/.{2}/g)
          ?.map((value) => Number.parseInt(value, 16)) ?? []
      return `  \x1b[38;2;${color.join(";")}m${line}${reset}`
    }),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}mammouth -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
