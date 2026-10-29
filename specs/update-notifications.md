# Update notifications

## V2 implementation

The V1 implementation described below moved to `packages/cli/src/services/updater.ts`
in the v2.1.2 upgrade. The active V2 updater keeps Mammouth's GitHub release source,
`code.mammouth.ai` installers, four-component version ordering, and notify-by-default
policy. It only detects `~/.mammouth/bin/mammouth`, with `.exe` on Windows.
Package-manager detection and upstream package installation are no longer available.

V2 accepts native `update: "disable" | "notify" | "auto"` and the existing
`autoupdate` values. Automatic installs remain opt-in and patch-only. Minor and
major upgrades notify. A release older than the running build never triggers an
automatic downgrade. Both `MAMMOUTH_*` and `OPENCODE_*` update flags work, with
Mammouth taking precedence.

The Windows updater runs the downloaded PowerShell file with
`-NoProfile -ExecutionPolicy Bypass -File`. V2 also retains a hard link to an
installed running image while updating, including while its background service
runs. This replaces the old Windows Git Bash requirement. Real Windows installer
and executable-lock verification still needs a Windows host.

Run updater regressions from `packages/cli` with:

```sh
bun test src/services/updater.test.ts test/updater-install.test.ts test/upgrade.test.ts
```

The release workflow builds `packages/cli` with Bun 1.4.2 and runs
`bun run script/service-smoke.ts` against the compiled Mammouth artifact, including
the real service, embedded web assets, and plugin loading. Run
`bun run script/migration-smoke.ts` there to verify a disposable V1 database,
Mammouth credentials/configs, selected model and reasoning variant, conversation
resume through a local provider, and a second compiled launch. The script also
checks client configuration migration and saved preferences through their owning
production modules. It never opens the developer's installed data or service.

The V2 service uses Mammouth's state directory and default port 49376 on POSIX,
45280 on Windows. Local source builds use the following port. These ports avoid
the upstream OpenCode service ports, so both installations can coexist.

Linux verification passed on 2026-10-22. Before release, exercise the compiled
Mammouth binary and installers on real macOS and Windows hosts, including Windows
replacement while the V2 background service runs. V1 plugins and server API
consumers need porting; session permission and undo/revert resets are upstream
migration behavior.

## V1 investigation

Mammouth Code is a fork of opencode. Upstream opencode checks for a new release shortly after the TUI starts and shows an "Update Available" dialog. Mammouth Code never did. This page records why, what was changed, and how to test it.

## Symptom

Launching `mammouth` never shows the update dialog, even when a newer release exists on GitHub. `mammouth upgrade` works when run by hand.

## Root cause

The startup check was still scheduled, but the function it called was an empty stub. `packages/opencode/src/cli/upgrade.ts` contained a comment and `return`.

The call chain:

1. `cli/cmd/tui.ts` schedules `checkUpgrade` one second after launch.
2. `cli/tui/worker.ts` runs `upgrade()` from `cli/upgrade.ts`.
3. `upgrade()` returned immediately, so no `installation.update-available` event was ever emitted.

The stub made sense when it was written and then outlived its reason:

| Date       | Commit    | Change                                                                                                                                                             |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-21 | b0b0c7bff | `upgrade()` stubbed out. At the time the check compared against upstream opencode releases, so it would have offered opencode versions to Mammouth Code users.     |
| 2026-04-28 | 8e3228a17 | `Installation.latest()` and the curl upgrader pointed at `mammouth-ai/code` releases and the `code.mammouth.ai` install scripts. The reason for the stub was gone. |
| 2026-06-19 | f6b71917f | Upstream v1.17.8 merge. The conflict in `upgrade.ts` was resolved by keeping the stub and rewording the comment.                                                   |

Everything downstream of the stub was intact. `Installation.method()` recognises the `~/.mammouth/bin` install, `Installation.latest()` reads the latest GitHub release, the worker forwards global bus events to the TUI, and `packages/tui/src/app.tsx` already handles `installation.update-available` with a rebranded dialog that calls the `global.upgrade` route.

## Why restoring the upstream code was not enough

**Strict semver rejects the release tags.** Releases are tagged `v1.17.11`, `v1.17.11.1`, `v1.17.11.2`. `getReleaseType()` used `semver.major()` and `semver.minor()`, which throw `Invalid Version` on a fourth segment. The worker swallows the rejection, so the check would still have shown nothing whenever either version had four segments.

**Upstream defaults to silent installs.** With `autoupdate` unset, upstream installs patch releases in the background and only shows the dialog for minor or major bumps. Every Mammouth Code release since June 2026 has been a patch by that rule. The TUI has no handler for `installation.updated`, so those installs would have been invisible to the user.

## What changed

`packages/opencode/src/cli/upgrade.ts`

- Restored the upstream check (reference: upstream commit 23b594de6).
- Dev builds (`channel === "local"`) skip the check unless `MAMMOUTH_ALWAYS_NOTIFY_UPDATE` is set.
- An unset `autoupdate` behaves as `"notify"`. Silent installs now require `"autoupdate": true` in the global config.
- Only a release newer than the running version triggers anything. A dev binary that is ahead of the latest release is left alone.

`packages/opencode/src/installation/index.ts`

- `compareVersions()` and `getReleaseType()` compare numeric segments instead of using `semver`, so four-segment tags work. `1.17.11.1` to `1.17.11.2` is a patch, `1.17.11.2` to `1.18.0` is a minor, `1.17.11.2` to `2.0.0` is a major.
- `method()` returns `"curl"` for a binary under `.mammouth/bin` and `"unknown"` for anything else. The upstream package-manager probes (npm, yarn, pnpm, bun, brew, scoop, choco) are gone. They detect an unrelated opencode install and would compare against its versions.
- On Windows the in-app upgrade fetches `install.ps1` and runs it with `powershell -NoProfile -ExecutionPolicy Bypass -File` from a temp file. It used to pipe the PowerShell script into bash or sh.

`packages/opencode/src/cli/cmd/upgrade.ts`

- `--method` only accepts `curl`. The other values installed the upstream `opencode-ai` package.

`packages/opencode/test/installation/installation.test.ts`

- Tests for version comparison, release classification, install-method detection, and the Windows script runner.

### Behaviour by `autoupdate` value

| `autoupdate` in global config               | Newer patch release                               | Newer minor or major release |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| unset or `"notify"`                         | dialog                                            | dialog                       |
| `true`                                      | silent install, then `installation.updated` event | dialog                       |
| `false`, or `MAMMOUTH_DISABLE_AUTOUPDATE=1` | nothing                                           | nothing                      |

The env flags also accept the upstream names `OPENCODE_ALWAYS_NOTIFY_UPDATE` and `OPENCODE_DISABLE_AUTOUPDATE`.

## How to test

Force the dialog regardless of version, including from a dev checkout:

```sh
MAMMOUTH_ALWAYS_NOTIFY_UPDATE=1 bun run dev
```

The same variable works on an installed binary. A real notification only appears when GitHub has a release newer than the installed one, so with the latest release installed this flag is the only way to see the dialog. In a dev checkout the "Update now" button fails with "Unknown installation method" because the running binary is not under `.mammouth/bin`. The dialog is what is being verified there.

Unit tests:

```sh
cd packages/opencode && bun test test/installation
```

Without a TTY, `packages/opencode/script/check-upgrade.ts` drives `upgrade()` directly and prints the global events it emits. Bake in an installed version with `bun --define` to simulate a release binary. Run it from `packages/opencode`:

```sh
bun run --define 'OPENCODE_VERSION:"1.17.11.1"' --define 'OPENCODE_CHANNEL:"latest"' script/check-upgrade.ts
```

## Verification (2026-09-03)

- `bun test test/installation` in `packages/opencode`: 16 tests pass, including the new version, method and Windows runner tests.
- `bun run typecheck` in `packages/opencode`: clean.
- `upgrade()` driven directly against the live GitHub releases API, latest release v1.17.11.2 at the time:

| Scenario                                             | Result                                                 |
| ---------------------------------------------------- | ------------------------------------------------------ |
| installed 1.17.11.1, no flags                        | `installation.update-available` with version 1.17.11.2 |
| installed 1.17.11.2                                  | no event                                               |
| installed 1.18.0, ahead of the latest release        | no event                                               |
| dev build, `MAMMOUTH_ALWAYS_NOTIFY_UPDATE=1`         | `installation.update-available` with version 1.17.11.2 |
| dev build, no flags                                  | no event, no network call                              |
| installed 1.17.11.1, `MAMMOUTH_DISABLE_AUTOUPDATE=1` | no event, no network call                              |

## Known limitations

- `Installation.latest()` calls the GitHub API without authentication. That is 60 requests per hour per IP, one per launch. Behind a shared office IP the check fails silently once the quota is used. Following the redirect on `https://github.com/mammouth-ai/code/releases/latest`, or serving a version file from `code.mammouth.ai`, would avoid the quota.
- The Windows runner is covered by a unit test with a mocked process spawner. It has not been exercised on a real Windows machine.
- The npm, brew, scoop and choco branches in `Installation.latest()` and `Installation.upgrade()` still point at upstream opencode packages. They are unreachable now that `method()` never returns those values. They were left in place to limit conflicts with upstream merges.
- The TUI has no toast for `installation.updated`, so an opt-in silent install gives no feedback until the next restart.
- `packages/tui/src/app.tsx` logs `installation.update-available` to the console when the event arrives. That line is upstream code.
