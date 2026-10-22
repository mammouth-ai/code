import type { ModelInfo } from "@opencode/client"
import { For, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { modelPreferenceKey } from "../model-preference"

export function prioritizeFavorites<T extends { value: { providerID: string; modelID: string } }>(
  options: T[],
  favorites: Set<string>,
) {
  return options.toSorted(
    (a, b) => Number(favorites.has(modelPreferenceKey(b.value))) - Number(favorites.has(modelPreferenceKey(a.value))),
  )
}

// The server owns model order (`Model.available()`: preferred free models first when signed out, newest first
// otherwise). This only applies the picker's grouping and keeps the server's order for everything else.
export function sortModelOptions<
  T extends {
    providerID?: string
    providerName?: string
    free?: boolean
  },
>(options: T[], grouped = true) {
  return options.toSorted((a, b) => {
    const provider = grouped
      ? Number(b.providerID === "mammouth-ai") - Number(a.providerID === "mammouth-ai") ||
        Number(b.providerID === "opencode-go") - Number(a.providerID === "opencode-go") ||
        Number(b.providerID === "opencode") - Number(a.providerID === "opencode")
      : 0
    if (provider !== 0) return provider

    const name = grouped ? (a.providerName ?? "").localeCompare(b.providerName ?? "") : 0
    if (name !== 0) return name

    return Number(b.free === true) - Number(a.free === true)
  })
}

export function isFreeModel(model: { cost: ReadonlyArray<{ input: number }> }) {
  return model.cost.length > 0 && model.cost.every((cost) => cost.input === 0)
}

export function modelPriceFooter(providerID: string, cost: { input?: number; output?: number } | undefined) {
  const input = cost?.input ?? 0
  if (input === 0) return providerID === "opencode" ? "Free" : undefined
  return `$${dollars(input)} / $${dollars(cost?.output ?? 0)}`
}

export function modelPriceTier(cost: { input?: number; output?: number } | undefined): 1 | 2 | 3 | 4 | undefined {
  const input = cost?.input ?? 0
  const output = cost?.output ?? 0
  if (input === 0 && output === 0) return
  const price = (2 * input + output) / 3
  if (price <= 1) return 1
  if (price <= 10) return 2
  if (price < 17) return 3
  return 4
}

export function PriceTier(props: { cost: { input?: number; output?: number } | undefined }) {
  const theme = useTheme().surface("dialog")
  const tier = () => modelPriceTier(props.cost)
  return (
    <Show when={tier()}>
      {(value) => (
        <span style={{ fg: theme.text.priceTier[value()] }}>
          {" "}
          {"$".repeat(Math.min(value(), 3))}
          {"·".repeat(Math.max(0, 3 - value()))}
          {value() === 4 ? "+" : ""}
        </span>
      )}
    </Show>
  )
}

/** The favorite marker. A styled span keeps its color on the highlighted row, where plain trailing text turns secondary. */
export function FavoriteMarker() {
  const theme = useTheme().surface("dialog")
  return <span style={{ fg: theme.text.formfield.selected }}>*</span>
}

/** Price, input modalities, context window and reasoning support for the selected model. */
export function ModelDetail(props: { model: ModelInfo; price?: boolean }) {
  const theme = useTheme().surface("dialog")
  const price = () => {
    if (isFreeModel(props.model)) return "Free"
    const cost = props.model.cost[0]
    if (!cost) return ""
    return `$${dollars(cost.input)}/$${dollars(cost.output)}`
  }
  const facts = () =>
    [
      props.model.capabilities.input.map(modality).join(", "),
      tokens(props.model.limit.context),
      ...(props.model.variants.length > 0 ? ["Reasoning"] : []),
    ].filter(Boolean)
  return (
    <box flexDirection="row" justifyContent={props.price === false ? "flex-start" : "space-between"} gap={2}>
      <Show when={props.price !== false}>
        <text fg={theme.text.faint} wrapMode="none">
          {price()}
        </text>
      </Show>
      <text fg={theme.text.faint} wrapMode="none" flexShrink={0}>
        <For each={facts()}>
          {(fact, index) => (
            <>
              {index() > 0 && <span style={{ fg: theme.hue.neutral[400] }}> · </span>}
              {fact}
            </>
          )}
        </For>
      </text>
    </box>
  )
}

function dollars(value: number) {
  return String(Number(value.toFixed(2)))
}

function modality(value: string) {
  if (value === "pdf") return "PDF"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function tokens(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}
