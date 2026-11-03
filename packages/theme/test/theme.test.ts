import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { migrateV1, parseThemeDocument, resolveThemeDocument } from "../src/tui/index.js"
import type { ThemeV1Json } from "../src/tui/v1.js"

const source: ThemeV1Json = await Bun.file(new URL("../../tui/src/theme/assets/opencode.json", import.meta.url)).json()
const document = migrateV1(source)

test.each(["light", "dark"] as const)("resolves %s themes without status tokens", (mode) => {
  const theme = resolveThemeDocument(document, mode)
  expect("status" in theme.text).toBeFalse()
  expect(theme.hue.accent[800]).toBeDefined()
  expect(theme.hue.interactive[800]).toBeDefined()
  expect(theme.text.priceTier[1]).toBeDefined()
  expect(theme.text.priceTier[4]).toBeDefined()
})

test.each(["light", "dark"] as const)(
  "preserves price-tier defaults for built-in and custom %s themes",
  async (mode) => {
    const builtin = parseThemeDocument(
      await Bun.file(new URL("../../tui/src/theme/assets/v2/opencode.json", import.meta.url)).json(),
    )
    const custom = parseThemeDocument({
      ...builtin,
      base: { ...builtin.base, text: { ...builtin.base.text, priceTier: { 1: "#123456" } } },
    })
    expect(resolveThemeDocument(builtin, mode).text.priceTier[4]).toBeDefined()
    expect(resolveThemeDocument(custom, mode).text.priceTier[1].equals(RGBA.fromHex("#123456"))).toBe(true)
    expect(resolveThemeDocument(custom, mode).text.priceTier[4]).toBeDefined()
  },
)
