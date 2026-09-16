import { describe, expect, test } from "bun:test"
import { humanizeModelName } from "@opencode-ai/core/models-dev"

describe("humanizeModelName", () => {
  test("keeps variant suffixes on Claude models", () => {
    expect(humanizeModelName("claude-opus-5")).toBe("Claude Opus 5")
    expect(humanizeModelName("claude-opus-5-fast")).toBe("Claude Opus 5 Fast")
    expect(humanizeModelName("claude-opus-4-8")).toBe("Claude Opus 4.8")
    expect(humanizeModelName("claude-fable-5.1")).toBe("Claude Fable 5.1")
    expect(humanizeModelName("claude-3-5-sonnet-20241022")).toBe("Claude 3.5 Sonnet")
    expect(humanizeModelName("claude-3-5-haiku-fast")).toBe("Claude 3.5 Haiku Fast")
  })

  test("capitalizes non-Claude names word by word", () => {
    expect(humanizeModelName("gpt-6-astra")).toBe("GPT 6 Astra")
    expect(humanizeModelName("glm-5")).toBe("GLM 5")
  })
})
