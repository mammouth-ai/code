import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@opencode/util/effect-flock"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { expect } from "bun:test"
import { Effect, FileSystem, Layer, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

it.live("only detects the Mammouth installer and never probes unrelated package managers", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "mammouth-updater-" })
    const global = Global.make({
      home: root,
      cache: path.join(root, "cache"),
      state: path.join(root, "state"),
      config: path.join(root, "config"),
    })
    const installed = path.join(root, ".mammouth", "bin", process.platform === "win32" ? "mammouth.exe" : "mammouth")
    for (const executable of [
      installed,
      path.join(root, ".opencode", "bin", "opencode"),
      path.join(root, "node_modules", "@opencode", "cli", "bin", "opencode"),
    ]) {
      const updater = yield* Updater.Service.pipe(
        Effect.provide(Updater.layer),
        Effect.provide(
          LayerNode.compile(EffectFlock.node, {
            replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
          }),
        ),
        Effect.provideService(Global.Service, global),
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          realPath: (input) => Effect.succeed(input === process.execPath ? executable : input),
        }),
        Effect.provideService(
          AppProcess.Service,
          AppProcess.Service.of({
            ...spawner,
            run: () => Effect.die("Installation detection must not spawn a process"),
            runStream: () => Stream.die("Unexpected process"),
          }),
        ),
      )
      expect(yield* updater.method()).toBe(executable === installed ? "curl" : undefined)
      expect(updater.removal("curl")).toBeUndefined()
      const result = yield* updater.upgrade("curl", "2.1.2; invalid").pipe(Effect.flip)
      expect(result.message).toContain("Invalid version")
    }
  }),
)
