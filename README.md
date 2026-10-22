<p align="center">
  <a href="https://mammouth.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logotype.svg" media="(prefers-color-scheme: dark)">
      <img src="packages/console/app/src/asset/logotype.svg" alt="Mammouth AI logo">
    </picture>
  </a>
</p>
<p align="center">Mammouth AI coding agent.</p>

[![Mammouth Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://info.mammouth.ai/docs/mammouth-code/)

---

### Installation

Linux/Mac/WSL:

```bash
curl -fsSL https://code.mammouth.ai/install.sh | bash
```

Windows (Powershell):

```ps1
irm "https://code.mammouth.ai/install.ps1" | iex
```

#### Installation Directory

The install script installs Mammouth Code to `$HOME/.mammouth/bin`.

The install script will add this directory to your `PATH` on your shell profile (`.bashrc`, `.zshrc`, etc.) if it's not already included. You will need to restart your terminal or run `source ~/<your appropriate profile file>` for the changes to take effect.

### Agents

Mammouth Code includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

### Documentation

For more info on how to configure Mammouth Code, [**head over to our docs**](https://info.mammouth.ai/).

### Upgrade the upstream OpenCode base

Start Mammouth Code in this repository and run:

```text
/upgrade-opencode
/upgrade-opencode 2.1.2
/upgrade-opencode v2.1.2 hey, make sure you also update our Windows installer checks
/upgrade-opencode latest check our reasoning-effort variants and model prices
/upgrade-opencode latest <Notion task URL or additional instructions>
```

With no version, the command selects the latest stable release from the
[official OpenCode changelog](https://opencode.ai/changelog) and verifies its tag
in `anomalyco/opencode`. GitHub's latest-release endpoint still tracks OpenCode 1
and is not the source for current OpenCode 2 releases.
An explicit version selects that exact upstream tag.

Everything after the version is an optional free-form comment, just like
`/upgrade-litellm`. No flag or quoting is required. Use it for extra work to
complete and verify during the upgrade, or include a Notion task page alongside
your instructions. Comments without a version also work and select the latest
stable release.

The command lives in [`.opencode/command/upgrade-opencode.md`](.opencode/command/upgrade-opencode.md).
It merges the release on an upgrade branch, audits Mammouth customizations, and
runs package checks and a compiled-binary smoke test. It leaves the merge ready
for review without committing, pushing, or creating a PR.

For a V1-to-V2 upgrade, it ports Mammouth behavior into the active `packages/cli`
implementation and updates the fork's build, installer, updater, and smoke-test
paths. Keeping changes only in the legacy CLI is not sufficient.

Upstream tags are fetched into `refs/upstream-tags/opencode/`, so a fork release
tag with the same name stays intact. Release tagging is manual after review and
commit. Choose the fork release version and tag its release commit, including a
fourth version component for a fork hotfix when needed.

Quit and restart Mammouth Code after adding or changing the command so it loads.

### Building on Mammouth Code

If you are working on a project that's related to Mammouth Code and is using "mammouth" as part of its name, for example "mammouth-dashboard" or "mammouth-mobile", please add a note to your README to clarify that it is not built by the Mammouth Code team and is not affiliated with us in any way.

### FAQ

#### Is this just not a fork of OpenCode, but forcing a private provider?

Yes, that's exactly what it is. It also serves as an easy way for our users to setup a local agent that can connect to our hosted API, and also allows us to add features that are specific to our API and not available to just using OpenCode with Mammouth API as a custom provider.

---

**Join our community** [Discord](https://discord.gg/YJg2kX77M3)
