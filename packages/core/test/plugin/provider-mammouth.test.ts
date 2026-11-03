import { expect } from "bun:test"
import { Effect } from "effect"
import { Money } from "@opencode/schema/money"
import { Credential } from "@opencode/core/credential"
import { Integration } from "@opencode/core/integration"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { MammouthPlugin } from "@opencode/core/plugin/provider/mammouth"
import { PluginTestLayer } from "./fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(PluginTestLayer)

for (const keyed of [false, true]) {
  it.effect(
    `keeps free Mammouth models and ${keyed ? "enables" : "hides"} paid models with ${keyed ? "a key" : "no key"}`,
    () =>
      Effect.gen(function* () {
        const providers = yield* Provider.Service
        const models = yield* Model.Service
        const integrations = yield* Integration.Service
        const credentials = yield* Credential.Service
        const plugins = yield* Plugin.Service
        const host = yield* PluginHost.make(plugins)
        const providerID = Provider.ID.make("mammouth-ai")
        const free = Model.ID.make("mammouth-recommended")
        const paid = Model.ID.make("claude-opus-5-fast")
        yield* integrations.transform((editor) =>
          editor.method.update({ integrationID: Integration.ID.make(providerID), method: { type: "key" } }),
        )
        if (keyed)
          yield* credentials.create({
            integrationID: Integration.ID.make(providerID),
            label: "Fixture",
            value: Credential.Key.make({ type: "key", key: "dummy" }),
          })
        yield* providers.transform((editor) =>
          editor.add({
            info: { ...Provider.Info.empty(providerID), activation: "auto" },
            models: [
              Model.Info.default(providerID, free),
              {
                ...Model.Info.default(providerID, paid),
                cost: [
                  {
                    input: Money.USDPerMillionTokens.make(5),
                    output: Money.USDPerMillionTokens.make(25),
                    cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
                  },
                ],
              },
            ],
          }),
        )
        yield* MammouthPlugin.effect(host)
        expect((yield* models.get(providerID, free))?.enabled).toBe(true)
        expect((yield* models.get(providerID, paid))?.enabled).toBe(keyed)
      }),
  )
}
