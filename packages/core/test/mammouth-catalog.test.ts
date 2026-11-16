import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MammouthCatalog } from "@opencode/core/mammouth-catalog"

describe("Mammouth catalog", () => {
  test("preserves allowed model IDs, names, metadata, and capability-derived wire variants", () => {
    const snapshot = MammouthCatalog.snapshot(
      Schema.decodeUnknownSync(MammouthCatalog.Response)({
        data: [
          {
            model_name: "claude-opus-5-fast",
            model_info: {
              supports_reasoning: true,
              supports_none_reasoning_effort: true,
              supports_minimal_reasoning_effort: true,
              supports_xhigh_reasoning_effort: true,
              supports_max_reasoning_effort: true,
              supports_vision: true,
              supports_pdf_input: true,
              supports_function_calling: true,
              input_cost_per_token: 0.000005,
              output_cost_per_token: 0.000025,
              max_input_tokens: 200000,
              max_output_tokens: 32000,
            },
          },
          { model_name: "mammouth-recommended" },
          { model_name: "image-only-model" },
          { model_name: "kimi-k2.6", model_info: { supports_reasoning: true } },
        ],
      }),
    )
    expect(String(snapshot.info.id)).toBe("mammouth-ai")
    expect(snapshot.environment).toEqual(["MAMMOUTH_API_KEY"])
    expect(snapshot.models.map((model) => String(model.id))).toEqual([
      "claude-opus-5-fast",
      "mammouth-recommended",
      "kimi-k2.6",
    ])
    const model = snapshot.models[0]
    expect(model.name).toBe("Claude Opus 5 Fast")
    expect(model.limit).toEqual({ context: 232000, input: 200000, output: 32000 })
    expect(model.capabilities.input).toEqual(["text", "image", "pdf"])
    expect(Number(model.cost[0].input)).toBe(5)
    expect(Number(model.cost[0].output)).toBe(25)
    expect(model.variants.map((variant) => String(variant.id))).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
    expect(model.variants.at(-1)?.body).toEqual({ reasoning_effort: "max" })
    expect(snapshot.models[2].variants.map((variant) => String(variant.id))).toEqual(["low", "medium", "high"])
  })
})
