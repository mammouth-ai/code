export * as MammouthCatalog from "./mammouth-catalog.js"

import { Schema } from "effect"
import { Money } from "@opencode/schema/money"
import { Model } from "./model.js"
import { Provider } from "./provider.js"
import type { Snapshot } from "./models-dev.js"

export const recommended = "mammouth-recommended"
export const url = "https://api.mammouth.ai/public/model/info"
const families = [
  "claude",
  "gpt",
  "o4",
  "gemini",
  "mistral",
  "codestral",
  "deepseek",
  "grok",
  "llama",
  "kimi",
  "qwen",
  "glm",
  "minimax",
]
const flag = Schema.optional(Schema.NullOr(Schema.Boolean))
const number = Schema.optional(Schema.NullOr(Schema.Number))
export const Response = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      model_name: Schema.String,
      model_info: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            litellm_provider: Schema.optional(Schema.NullOr(Schema.String)),
            supports_reasoning: flag,
            supports_none_reasoning_effort: flag,
            supports_minimal_reasoning_effort: flag,
            supports_xhigh_reasoning_effort: flag,
            supports_max_reasoning_effort: flag,
            supports_vision: flag,
            supports_pdf_input: flag,
            supports_audio_input: flag,
            supports_audio_output: flag,
            supports_function_calling: flag,
            supports_tool_choice: flag,
            input_cost_per_token: number,
            output_cost_per_token: number,
            cache_read_input_token_cost: number,
            cache_creation_input_token_cost: number,
            max_input_tokens: number,
            max_output_tokens: number,
          }),
        ),
      ),
    }),
  ),
})

const capitalize = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : word)

export function humanizeModelName(name: string): string {
  const parts = name.split(/[-_]+/)
  if (parts[0].toLowerCase() === "claude") {
    const filtered = parts.filter((part) => !/^20\d{6}$/.test(part))
    if (/^\d+$/.test(filtered[1] ?? "")) {
      const end = filtered.findIndex((part, index) => index > 0 && !/^\d+$/.test(part))
      const version = filtered.slice(1, end < 0 ? undefined : end).join(".")
      return ["Claude", version, ...filtered.slice(end < 0 ? filtered.length : end).map(capitalize)].join(" ")
    }
    const rest = filtered.slice(2)
    return [
      "Claude",
      capitalize(filtered[1] ?? ""),
      rest.filter((part) => /^\d+(\.\d+)*$/.test(part)).join("."),
      ...rest.filter((part) => !/^\d+(\.\d+)*$/.test(part)).map(capitalize),
    ]
      .filter(Boolean)
      .join(" ")
  }
  const special: Record<string, string> = { gpt: "GPT", o4: "o4", glm: "GLM" }
  return parts.map((part) => special[part.toLowerCase()] ?? capitalize(part)).join(" ")
}

export function snapshot(response: typeof Response.Type = { data: [] }): Snapshot {
  const providerID = Provider.ID.make("mammouth-ai")
  return {
    info: {
      id: providerID,
      name: "Mammouth AI",
      activation: "auto",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: "https://api.mammouth.ai/v1", provider: "mammouth-ai" },
    },
    environment: ["MAMMOUTH_API_KEY"],
    models: response.data
      .filter(
        (item) =>
          item.model_name === recommended ||
          families.some((family) => item.model_name.toLowerCase().startsWith(family)),
      )
      .map((item): Model.Info => {
        const info = item.model_info ?? {}
        // LiteLLM translates this common wire field to each model's native reasoning control.
        const efforts = !info.supports_reasoning
          ? []
          : [
              ...(info.supports_none_reasoning_effort ? ["none"] : []),
              ...(info.supports_minimal_reasoning_effort ? ["minimal"] : []),
              "low",
              "medium",
              "high",
              ...(info.supports_xhigh_reasoning_effort ? ["xhigh"] : []),
              ...(info.supports_max_reasoning_effort ? ["max"] : []),
            ]
        return {
          ...Model.Info.default(providerID, Model.ID.make(item.model_name)),
          name: humanizeModelName(item.model_name),
          family: info.litellm_provider ? Model.Family.make(info.litellm_provider) : undefined,
          capabilities: {
            tools: Boolean(info.supports_function_calling || info.supports_tool_choice),
            temperature: true,
            input: [
              "text",
              ...(info.supports_vision ? ["image"] : []),
              ...(info.supports_pdf_input ? ["pdf"] : []),
              ...(info.supports_audio_input ? ["audio"] : []),
            ],
            output: ["text", ...(info.supports_audio_output ? ["audio"] : [])],
          },
          variants: efforts.map((effort) => ({ id: Model.VariantID.make(effort), body: { reasoning_effort: effort } })),
          cost: [
            {
              input: Money.USDPerMillionTokens.make((info.input_cost_per_token ?? 0) * 1_000_000),
              output: Money.USDPerMillionTokens.make((info.output_cost_per_token ?? 0) * 1_000_000),
              cache: {
                read: Money.USDPerMillionTokens.make((info.cache_read_input_token_cost ?? 0) * 1_000_000),
                write: Money.USDPerMillionTokens.make((info.cache_creation_input_token_cost ?? 0) * 1_000_000),
              },
            },
          ],
          limit: {
            context: (info.max_input_tokens ?? 0) + (info.max_output_tokens ?? 0),
            input: info.max_input_tokens ?? undefined,
            output: info.max_output_tokens ?? 0,
          },
        }
      }),
  }
}
