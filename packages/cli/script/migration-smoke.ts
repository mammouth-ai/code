#!/usr/bin/env bun

import { Database } from "bun:sqlite"
import { OpenCode } from "@opencode/client"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { ConfigMigration } from "../src/config/migrate"
import { NodeFileSystem } from "@effect/platform-node"
import { Effect } from "effect"
import { createModelPreferenceRepository } from "@opencode/tui/model-preference"

const binary = path.resolve(
  import.meta.dir,
  "../dist",
  `mammouth-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`,
  "bin",
  process.platform === "win32" ? "mammouth.exe" : "mammouth",
)
const root = await fs.mkdtemp(path.join(os.tmpdir(), "mammouth-migration-"))
const data = path.join(root, "data", "mammouth")
const config = path.join(root, "config", "mammouth")
const project = path.join(root, "project")
const schema = Bun.spawnSync(
  ["git", "show", "45b8d467ecd8b4885143208fa681acbe5fae3982:packages/core/src/database/schema.gen.ts"],
  { cwd: path.resolve(import.meta.dir, "../../..") },
)
const journal = Bun.spawnSync(
  ["git", "show", "45b8d467ecd8b4885143208fa681acbe5fae3982:packages/core/src/database/migration.gen.ts"],
  { cwd: path.resolve(import.meta.dir, "../../..") },
)
assert.equal(schema.exitCode, 0)
assert.equal(journal.exitCode, 0)
await Promise.all(
  [data, config, project, path.join(root, "tmp"), path.join(project, ".mammouth")].map((directory) =>
    fs.mkdir(directory, { recursive: true }),
  ),
)
const db = new Database(path.join(data, "opencode.db"))
for (const match of schema.stdout.toString().matchAll(/tx\.run\(\s*`((?:\\[\s\S]|[^`])*)`/g))
  db.run(match[1].replaceAll("\\`", "`"))
db.run("CREATE TABLE migration (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)")
for (const match of journal.stdout.toString().matchAll(/import\("\.\/migration\/([^\"]+)"\)/g))
  db.run("INSERT INTO migration VALUES (?, ?)", [match[1], 1])
db.run("INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('global', ?, 1, 2, '[]')", [
  project,
])
db.run(
  "INSERT INTO session (id, project_id, slug, directory, title, version, agent, model, permission, revert, time_created, time_updated) VALUES ('ses_migration_fixture', 'global', 'fixture', ?, 'Mammouth V1 conversation', '1.18.31', 'build', ?, '{}', '{}', 1, 2)",
  [project, JSON.stringify({ id: "claude-opus-5-fast", providerID: "mammouth-ai", variant: "max" })],
)
const userID = "msg_000000000001aaaaaaaaaaaaaa"
const assistantID = "msg_000000000002aaaaaaaaaaaaaa"
db.run("INSERT INTO message VALUES (?, 'ses_migration_fixture', 10, 11, ?)", [
  userID,
  JSON.stringify({
    role: "user",
    time: { created: 10 },
    agent: "build",
    model: { providerID: "mammouth-ai", modelID: "claude-opus-5-fast", variant: "max" },
  }),
])
db.run("INSERT INTO message VALUES (?, 'ses_migration_fixture', 20, 21, ?)", [
  assistantID,
  JSON.stringify({
    role: "assistant",
    time: { created: 20, completed: 21 },
    parentID: userID,
    agent: "build",
    mode: "build",
    providerID: "mammouth-ai",
    modelID: "claude-opus-5-fast",
    variant: "max",
    path: { cwd: project, root: project },
    cost: 0,
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    finish: "stop",
  }),
])
db.run("INSERT INTO part VALUES ('prt_fixture_user', ?, 'ses_migration_fixture', 10, 11, ?)", [
  userID,
  JSON.stringify({ type: "text", text: "Keep this V1 question" }),
])
db.run("INSERT INTO part VALUES ('prt_fixture_assistant', ?, 'ses_migration_fixture', 20, 21, ?)", [
  assistantID,
  JSON.stringify({ type: "text", text: "Keep this V1 answer" }),
])
db.close()
await Bun.write(
  path.join(data, "auth.json"),
  JSON.stringify({ "mammouth-ai": { type: "api", key: "dummy-migration-key" } }),
)
await Bun.write(
  path.join(config, "mammouth.jsonc"),
  JSON.stringify({ username: "global-mammouth", model: "mammouth-ai/claude-opus-5-fast", autoupdate: "notify" }),
)
await Bun.write(path.join(project, "opencode.json"), JSON.stringify({ username: "upstream-project" }))
await Bun.write(
  path.join(project, ".mammouth", "mammouth.jsonc"),
  JSON.stringify({
    username: "mammouth-project",
    providers: {
      "mammouth-ai": {
        models: {
          "claude-opus-5-fast": {
            name: "Claude Opus 5 Fast",
            limit: { context: 232000, output: 32000 },
            variants: [{ id: "max", body: { reasoning_effort: "max" } }],
          },
        },
      },
    },
  }),
)
await Bun.write(path.join(config, "tui.json"), JSON.stringify({ theme: "mammouth" }))
await Bun.write(
  path.join(root, "state", "mammouth", "kv.json"),
  JSON.stringify({ theme: "mammouth", theme_mode_lock: "dark" }),
)
const selected = { providerID: "mammouth-ai", modelID: "claude-opus-5-fast" }
const preferences = path.join(root, "state", "mammouth", "model.json")
await Bun.write(
  preferences,
  JSON.stringify({ recent: [selected], favorite: [selected], variant: { "mammouth-ai/claude-opus-5-fast": "max" } }),
)
assert.equal(await createModelPreferenceRepository(preferences).resolveVariant(selected), "max")
await Effect.runPromise(
  ConfigMigration.run({
    file: path.join(config, "cli.json"),
    config,
    state: path.join(root, "state", "mammouth"),
  }).pipe(Effect.provide(NodeFileSystem.layer)),
)
assert.deepEqual((await Bun.file(path.join(config, "cli.json")).json()).theme, { name: "mammouth", mode: "dark" })
const requests: Array<{ body: Record<string, unknown>; authorization: string | null }> = []
await Bun.write(path.join(config, "config.json"), JSON.stringify({ username: "legacy-global" }))
const provider = Bun.serve({
  port: 0,
  async fetch(request) {
    const body = await request.json()
    requests.push({ body, authorization: request.headers.get("authorization") })
    if (body.stream)
      return new Response(
        'data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"claude-opus-5-fast","choices":[{"index":0,"delta":{"content":"Resumed V1 conversation"},"finish_reason":null}]}\n\ndata: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"claude-opus-5-fast","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } },
      )
    return Response.json({
      id: "fixture",
      object: "chat.completion",
      created: 1,
      model: "claude-opus-5-fast",
      choices: [{ index: 0, message: { role: "assistant", content: "Fixture title" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  },
})
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("MAMMOUTH_") && !key.startsWith("OPENCODE_")),
  ),
  HOME: root,
  USERPROFILE: root,
  TMPDIR: path.join(root, "tmp"),
  TEMP: path.join(root, "tmp"),
  TMP: path.join(root, "tmp"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  XDG_STATE_HOME: path.join(root, "state"),
  MAMMOUTH_TEST_HOME: root,
  MAMMOUTH_PASSWORD: "fixture-password",
  MAMMOUTH_DISABLE_AUTOUPDATE: "1",
  MAMMOUTH_DISABLE_MODELS_FETCH: "1",
  MAMMOUTH_CONFIG_CONTENT: JSON.stringify({
    providers: { "mammouth-ai": { settings: { baseURL: provider.url.toString() } } },
  }),
}
const children: Bun.Subprocess[] = []
try {
  const version = Bun.spawnSync([binary, "--version"], { env, cwd: project })
  assert.equal(version.exitCode, 0)
  assert.equal(version.stdout.toString().trim(), "mammouth v2.1.2")
  for (const launch of [1, 2]) {
    const child = Bun.spawn([binary, "serve", "--stdio", "--port", "0"], {
      cwd: project,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    children.push(child)
    const stderr = new Response(child.stderr).text()
    const reader = child.stdout.getReader()
    const first = await reader.read()
    if (!first.value) throw new Error(await stderr)
    const ready = JSON.parse(new TextDecoder().decode(first.value).split("\n")[0])
    const client = OpenCode.make({
      baseUrl: ready.url,
      headers: { authorization: `Basic ${btoa("opencode:fixture-password")}` },
    })
    const deadline = Date.now() + 30000
    while ((await client.migration.v1.status()).status !== "completed") {
      assert.ok(Date.now() < deadline, "Migration did not complete")
      await Bun.sleep(25)
    }
    const session = await client.session.get({ sessionID: "ses_migration_fixture" })
    assert.equal(session.title, "Mammouth V1 conversation")
    assert.deepEqual(session.model, { id: "claude-opus-5-fast", providerID: "mammouth-ai", variant: "max" })
    assert.equal(session.revert, undefined)
    assert.equal(session.permissions, undefined)
    const messages = await client.message.list({ sessionID: session.id })
    assert.ok(JSON.stringify(messages).includes("Keep this V1 question"))
    assert.ok(JSON.stringify(messages).includes("Keep this V1 answer"))
    const credentials = await client.credential.list()
    assert.ok(JSON.stringify(credentials).includes("dummy-migration-key"))
    const entries = await client.config.get({ location: { directory: project } })
    assert.ok(entries.some((entry) => entry.type === "document" && entry.info.username === "legacy-global"))
    assert.equal(
      entries
        .flatMap((entry) => (entry.type === "document" && entry.info.username ? [entry.info.username] : []))
        .at(-1),
      "mammouth-project",
    )
    const models = await client.model.list({ location: { directory: project } })
    assert.ok(
      models.data.some(
        (model) =>
          model.providerID === "mammouth-ai" &&
          model.id === "claude-opus-5-fast" &&
          model.variants.some((variant) => variant.id === "max"),
      ),
    )
    assert.ok(!models.data.some((model) => model.providerID === "opencode"))
    assert.equal((await createModelPreferenceRepository(preferences).load()).favorite[0].modelID, "claude-opus-5-fast")
    if (launch === 1) {
      await client.session.prompt({ sessionID: session.id, text: "Resume this migrated conversation" })
      await client.session.wait({ sessionID: session.id })
      const resumed = await client.message.list({ sessionID: session.id })
      assert.ok(JSON.stringify(resumed).includes("Resumed V1 conversation"))
      assert.ok(
        requests.some(
          (request) =>
            request.body.reasoning_effort === "max" &&
            request.authorization === "Bearer dummy-migration-key" &&
            JSON.stringify(request.body).includes("Keep this V1 answer"),
        ),
      )
    }
    child.stdin.end()
    assert.equal(await child.exited, 0, await stderr)
    await reader.cancel()
  }
  console.log(
    "Compiled V1 migration, credential/config discovery, reasoning request, session resume, and second launch passed",
  )
} finally {
  children.forEach((child) => child.kill())
  await Promise.all(children.map((child) => child.exited))
  provider.stop(true)
  await fs.rm(root, { recursive: true, force: true })
}
