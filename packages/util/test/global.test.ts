import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { Context, Effect, Layer } from "effect"
import { Global } from "../src/global.js"

describe("global", () => {
  test("Mammouth env settings take precedence without aliasing the provider API key", () => {
    const module = pathToFileURL(path.join(import.meta.dir, "../src/env.ts")).href
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "-e",
        `const { mammouthEnvironment } = await import(${JSON.stringify(module)}); mammouthEnvironment(); console.log(JSON.stringify([process.env.OPENCODE_CONFIG, process.env.OPENCODE_API_KEY]))`,
      ],
      env: {
        ...process.env,
        MAMMOUTH_CONFIG: "mammouth.json",
        OPENCODE_CONFIG: "opencode.json",
        MAMMOUTH_API_KEY: "mammouth-key",
        OPENCODE_API_KEY: "zen-key",
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual(["mammouth.json", "zen-key"])
  })
  test("importing the module does not create directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-import-"))
    const directories = ["data", "cache", "config", "state", "tmp"].map((directory) => path.join(root, directory))
    const module = pathToFileURL(path.join(import.meta.dir, "../src/global.ts")).href
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `const { Global } = await import(${JSON.stringify(module)}); void Global.Path.tmp`],
      env: {
        ...process.env,
        XDG_DATA_HOME: directories[0],
        XDG_CACHE_HOME: directories[1],
        XDG_CONFIG_HOME: directories[2],
        XDG_STATE_HOME: directories[3],
        // os.tmpdir() reads TMPDIR on POSIX and TEMP on Windows.
        TMPDIR: directories[4],
        TEMP: directories[4],
      },
      stderr: "pipe",
    })

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    directories.forEach((directory) => expect(fs.existsSync(path.join(directory, "mammouth"))).toBe(false))
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("building layerWith creates service directories and preserves an explicit tmp", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-layer-"))
    const directories = {
      data: path.join(root, "data"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      log: path.join(root, "log"),
      bin: path.join(root, "bin"),
      repos: path.join(root, "repos"),
      tmp: path.join(root, "nested", "..", "tmp"),
    }

    const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))

    Object.values(directories).forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    expect(Context.get(context, Global.Service).tmp).toBe(directories.tmp)
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("building a layer with default tmp creates and canonicalizes it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-layer-"))
    const directories = ["data", "cache", "config", "state", "tmp"].map((directory) => path.join(root, directory))
    const module = pathToFileURL(path.join(import.meta.dir, "../src/global.ts")).href
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "-e",
        `
          import { Context, Effect, Layer } from "effect"
          const { Global } = await import(${JSON.stringify(module)})
          const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith({}))))
          process.stdout.write(Context.get(context, Global.Service).tmp)
        `,
      ],
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        XDG_DATA_HOME: directories[0],
        XDG_CACHE_HOME: directories[1],
        XDG_CONFIG_HOME: directories[2],
        XDG_STATE_HOME: directories[3],
        // os.tmpdir() reads TMPDIR on POSIX and TEMP on Windows.
        TMPDIR: directories[4],
        TEMP: directories[4],
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    // The layer canonicalizes through the native realpath, which on Windows also expands 8.3 short
    // names such as RUNNER~1 that the JavaScript realpathSync leaves in place.
    expect(result.stdout.toString()).toBe(fs.realpathSync.native(path.join(directories[4], "mammouth")))
    const created = [
      path.join(directories[0], "mammouth"),
      path.join(directories[1], "mammouth", "bin"),
      path.join(directories[2], "mammouth"),
      path.join(directories[3], "mammouth"),
      path.join(directories[0], "mammouth", "log"),
      path.join(directories[0], "mammouth", "repos"),
      path.join(directories[4], "mammouth"),
    ]
    created.forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    fs.rmSync(root, { recursive: true, force: true })
  })
})
