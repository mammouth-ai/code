import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Stream } from "effect"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"

export const MammouthPlugin = define({
  id: "mammouth.provider",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const connection = { active: Boolean(yield* ctx.integration.connection.active("mammouth-ai")) }
    yield* ctx.provider.transform((providers) => {
      const mammouth = providers.get("mammouth-ai")
      if (
        !mammouth ||
        !Array.from(mammouth.models.values()).some((model) => model.cost.every((cost) => cost.input === 0))
      )
        return
      providers.update("mammouth-ai", (provider) => {
        provider.activation = "enabled"
      })
    })
    yield* ctx.model.transform((models) => {
      const provider = models.provider.get("mammouth-ai")?.provider
      if (!provider || provider.settings?.apiKey || connection.active) return
      for (const model of models.list("mammouth-ai")) {
        if (!model.cost.some((cost) => cost.input > 0)) continue
        models.update("mammouth-ai", model.id, (draft) => {
          draft.enabled = false
        })
      }
    })
    yield* bus.subscribe(Credential.Event.Switched).pipe(
      Stream.filter((event) => event.data.integrationID === "mammouth-ai"),
      Stream.runForEach(() =>
        Effect.gen(function* () {
          connection.active = Boolean(yield* ctx.integration.connection.active("mammouth-ai"))
          yield* ctx.provider.reload()
          yield* ctx.model.reload()
        }),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
