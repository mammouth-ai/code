import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { EffectFlock } from "@opencode/util/effect-flock"
import { OPENCODE_LOCAL, OPENCODE_VERSION } from "../version"
import { Context, Duration, Effect, FileSystem, Layer, Ref, Schema } from "effect"
import { ChildProcess } from "effect/process"
import { parse, type ParseError } from "jsonc-parser"
import path from "node:path"
import { RetainedImage } from "./retained-image"
import { action, parseReleaseVersion, type Policy } from "./updater-action"
import { errorMessage } from "../util/error"

export const methods = ["curl"] as const
export type Method = (typeof methods)[number]
export type RunResult = { readonly type: "available" | "installed"; readonly version: string }
export type CheckResult = RunResult | { readonly type: "unavailable"; readonly message: string }

export class UpgradeError extends Error {
  readonly title: string
  readonly detail: string
  readonly command?: string
  readonly retry: string

  constructor(
    input: { readonly title: string; readonly detail: string; readonly command?: string; readonly retry: string },
    options?: ErrorOptions,
  ) {
    super(input.detail, options)
    this.name = "UpgradeError"
    this.title = input.title
    this.detail = input.detail
    this.command = input.command
    this.retry = input.retry
  }
}

export interface Interface {
  readonly run: (onInstall?: (version: string) => void) => Effect.Effect<RunResult | undefined>
  readonly check: () => Effect.Effect<CheckResult | undefined, Error>
  readonly apply: (version: string) => Effect.Effect<void, Error>
  readonly method: () => Effect.Effect<Method | undefined>
  readonly latest: (method?: Method) => Effect.Effect<string, Error>
  readonly upgrade: (method: Method, version: string) => Effect.Effect<void, Error>
  readonly removal: (
    method: Method,
  ) => { readonly command: ReadonlyArray<string>; readonly run: Effect.Effect<void, Error> } | undefined
}

export class Service extends Context.Service<Service, Interface>()("@opencode/cli/Updater") {}

export function installerCommand(platform: NodeJS.Platform, file: string, version: string) {
  return ChildProcess.make(
    platform === "win32" ? "powershell" : "bash",
    platform === "win32" ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file] : [file],
    { env: { VERSION: version }, extendEnv: true },
  )
}

export function decodePolicy(text: string): Policy | undefined {
  const errors: ParseError[] = []
  const input: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof input !== "object" || input === null) return
  if ("update" in input) {
    const value = input.update
    return value === "disable" || value === "notify" || value === "auto" ? value : undefined
  }
  if (!("autoupdate" in input)) return
  if (input.autoupdate === false) return "disable"
  if (input.autoupdate === "notify") return "notify"
  if (input.autoupdate === true) return "auto"
}

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const appProcess = yield* AppProcess.Service
  const flock = yield* EffectFlock.Service
  const installedVersion = yield* Ref.make(OPENCODE_VERSION)
  const executable = yield* fs.realPath(process.execPath).pipe(Effect.orElseSucceed(() => process.execPath))
  const installedPath = path.resolve(
    global.home,
    ".mammouth",
    "bin",
    process.platform === "win32" ? "mammouth.exe" : "mammouth",
  )
  const installedBinary = yield* fs.realPath(installedPath).pipe(Effect.orElseSucceed(() => installedPath))
  // Mammouth only ships its own installer. Probing package managers can find an unrelated OpenCode installation.
  const method = () => Effect.succeed(executable === installedBinary ? ("curl" as const) : undefined)
  const readPolicy = Effect.fnUntraced(function* () {
    const values = yield* Effect.forEach(
      ["config.json", "opencode.json", "opencode.jsonc", "mammouth.json", "mammouth.jsonc"],
      (name) =>
        fs.readFileString(path.join(global.config, name)).pipe(
          Effect.map(decodePolicy),
          Effect.orElseSucceed(() => undefined),
        ),
    )
    return values.findLast((value) => value !== undefined) ?? "notify"
  })
  const latest = Effect.fn("cli.updater.latest")(function* () {
    return yield* Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch("https://api.github.com/repos/mammouth-ai/code/releases/latest", {
          headers: { "User-Agent": `mammouth/${OPENCODE_VERSION}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        })
        if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
        const release = Schema.decodeUnknownSync(Schema.Struct({ tag_name: Schema.String }))(await response.json())
        if (!parseReleaseVersion(release.tag_name)) throw new Error(`Invalid release: ${release.tag_name}`)
        return release.tag_name.replace(/^v/, "")
      },
      catch: (cause) =>
        new UpgradeError(
          {
            title: "Could not check for Mammouth Code updates",
            detail: errorMessage(cause),
            retry: "Check your network, then run mammouth upgrade again.",
          },
          { cause },
        ),
    })
  })
  const upgrade = Effect.fn("cli.updater.upgrade")(function* (_method: Method, input: string) {
    if (_method !== "curl") return yield* Effect.fail(new Error("Mammouth Code only supports its curl installer"))
    if (!parseReleaseVersion(input)) return yield* Effect.fail(new Error(`Invalid version: ${input}`))
    const version = input.trim().replace(/^v/, "")
    return yield* Effect.scoped(
      Effect.gen(function* () {
        yield* flock.acquire("cli-upgrade", undefined, { timeoutMs: Duration.toMillis("15 minutes") })
        yield* fs.makeDirectory(global.cache, { recursive: true })
        const directory = yield* Effect.acquireRelease(
          fs.makeTempDirectory({ directory: global.cache, prefix: "update-" }),
          (directory) => fs.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
        )
        const windows = process.platform === "win32"
        const installer = path.join(directory, windows ? "install.ps1" : "install.sh")
        const body = yield* Effect.tryPromise({
          try: async (signal) => {
            const response = await fetch(`https://code.mammouth.ai/${windows ? "install.ps1" : "install.sh"}`, {
              signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            })
            if (!response.ok) throw new Error(`Installer returned HTTP ${response.status}`)
            return response.text()
          },
          catch: (cause) => new Error("Could not download the Mammouth Code installer", { cause }),
        })
        yield* fs.writeFileString(installer, body)
        if (windows && executable === installedBinary)
          yield* RetainedImage.retain(global.cache, "upgrade").pipe(Effect.provideService(FileSystem.FileSystem, fs))
        const result = yield* appProcess.run(installerCommand(process.platform, installer, version), {
          timeout: "5 minutes",
          maxOutputBytes: 100_000,
          maxErrorBytes: 100_000,
        })
        if (result.exitCode !== 0)
          return yield* Effect.fail(
            new Error(
              result.stderr.toString("utf8") ||
                result.stdout.toString("utf8") ||
                `Installer exited with code ${result.exitCode}`,
            ),
          )
      }),
    ).pipe(
      Effect.mapError(
        (cause) =>
          new UpgradeError(
            {
              title: "The Mammouth Code installer failed",
              detail: errorMessage(cause),
              command: `mammouth upgrade ${version} --method curl`,
              retry: "Fix the issue above, then run mammouth upgrade again.",
            },
            { cause },
          ),
      ),
    )
  })
  const install = Effect.fnUntraced(function* (version: string) {
    const detected = yield* method()
    if (!detected)
      return yield* Effect.fail(
        new Error("Could not detect the Mammouth installation. Install from https://code.mammouth.ai."),
      )
    yield* upgrade(detected, version)
    yield* Ref.set(installedVersion, version)
  })
  const check = Effect.fn("cli.updater.check")(function* () {
    if (OPENCODE_LOCAL)
      return {
        type: "unavailable" as const,
        message: "This build runs from a source checkout. Use an installed Mammouth Code release to check for updates.",
      }
    const detected = yield* method()
    if (!detected)
      return {
        type: "unavailable" as const,
        message: "Could not detect the Mammouth installation. Install from https://code.mammouth.ai.",
      }
    const version = yield* latest()
    const current = yield* Ref.get(installedVersion)
    if (action(current, version, "notify") !== "none") return { type: "available" as const, version }
    if (action(OPENCODE_VERSION, current, "notify") !== "none") return { type: "installed" as const, version: current }
  })
  const run = Effect.fn("cli.updater.run")(
    function* (onInstall: (version: string) => void = () => {}) {
      const force = ["1", "true"].includes(
        (process.env.MAMMOUTH_ALWAYS_NOTIFY_UPDATE ?? process.env.OPENCODE_ALWAYS_NOTIFY_UPDATE)?.toLowerCase() ?? "",
      )
      if (
        ["1", "true"].includes(
          (process.env.MAMMOUTH_DISABLE_AUTOUPDATE ?? process.env.OPENCODE_DISABLE_AUTOUPDATE)?.toLowerCase() ?? "",
        )
      )
        return
      if (OPENCODE_LOCAL && !force) return
      const policy = yield* readPolicy()
      if (policy === "disable") return
      const version = yield* latest()
      const next = force ? "notify" : action(yield* Ref.get(installedVersion), version, policy)
      if (next === "none") return
      if (next === "notify") return { type: "available" as const, version }
      onInstall(version)
      yield* install(version)
      return { type: "installed" as const, version }
    },
    Effect.catch((error) => Effect.logWarning("update check failed", { error }).pipe(Effect.as(undefined))),
  )
  return Service.of({ run, check, apply: install, method, latest, upgrade, removal: () => undefined })
})

export const layer = Layer.effect(Service, make)
export * as Updater from "./updater"
export { action, type Action, type Policy } from "./updater-action"
