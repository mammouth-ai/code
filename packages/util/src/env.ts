/** Apply the fork's preferred environment names before loading the runtime. */
export function mammouthEnvironment() {
  for (const [key, value] of Object.entries(process.env)) {
    // Provider credentials are independent: a Mammouth key must never authenticate OpenCode Zen.
    if (!key.startsWith("MAMMOUTH_") || key === "MAMMOUTH_API_KEY" || value === undefined) continue
    process.env[`OPENCODE_${key.slice("MAMMOUTH_".length)}`] = value
  }
}
