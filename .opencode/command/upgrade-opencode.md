---
description: Merge an upstream OpenCode release into Mammouth Code and verify the fork changes
agent: build
---

Upgrade the upstream OpenCode base of this Mammouth Code fork using these arguments: $ARGUMENTS

## Select the release

Usage: `/upgrade-opencode [version|latest] [comment...]`

Accept an optional first argument of `latest`, an upstream version such as
`2.1.2`, or its exact tag such as `v2.1.2`. With no version, use the latest
stable release announced in the official OpenCode changelog.

Everything after the version is one optional free-form comment, just like
`/upgrade-litellm`. Preserve its full text, including quotes, punctuation, and
multiple sentences. The comment is additional work to complete during the
upgrade, not merely text to include in the final summary. Add its requirements
to the task list, implement them, and verify them alongside the upgrade. Ask
about genuine ambiguity or conflicts with repository rules before proceeding
with that part. It does not need a flag, quoting, or a Notion reference.

If the first argument is neither a version nor `latest`, use the latest stable
release and treat the entire input as the comment. A comment may be a standalone
Notion task page ID or URL, mention one within a sentence, or contain no Notion
reference. Read any identified task page and honor the rest of the comment. If
the page is unavailable, report that and ask for required notes you cannot read.

Examples:

```text
/upgrade-opencode v2.1.2 hey, make sure you also update our Windows installer checks
/upgrade-opencode latest check our reasoning-effort variants and model prices
/upgrade-opencode v2.1.2 <Notion task URL> also cover the fast Claude variants
```

For the default or `latest`, read `https://opencode.ai/changelog` and select the
highest stable version among its published release headings. Exclude preview,
alpha, beta, and release-candidate entries. Consider all major versions, not just
the major version this fork currently uses. Verify the corresponding exact tag
in `anomalyco/opencode` using the tag-fetch workflow below, and inspect its
release commit and version metadata before merging.

Do not use GitHub's `releases/latest` endpoint as the authority for the current
release. OpenCode 1 uses GitHub Releases, while OpenCode 2 publishes release
notes on the official changelog and has upstream Git tags without corresponding
GitHub Release objects. For example, the changelog announces `v2.1.2` on October
21, 2026, while `releases/latest` still returns `v1.19.3`. A 404 when querying a
GitHub Release by tag does not mean the tag is missing or the release is unstable.

For an explicit version, only add the leading `v` if missing. Preserve all
version components and suffixes and require that exact upstream tag. Do not
substitute a newer version, a branch tip, an npm version, or a fork-only patch
tag. An explicit `v2.1.2` works directly from its upstream Git tag; a GitHub
Release object is not required. For automatic selection, if the changelog is
unavailable, the announced stable tag is missing, or the release evidence
conflicts, report the issue and ask for an explicit version rather than silently
falling back to an older GitHub release.

Read the applicable `AGENTS.md`, `CLAUDE.md`, this repository's `README.md`, and
`specs/update-notifications.md`. This is the standalone `mammouth-ai/code` fork
of `anomalyco/opencode`; there is no parent submodule pointer to update.

## Prepare the Git history

Inspect status, branch, remotes, recent commits, and any merge, rebase, or
cherry-pick already in progress. Record the starting fork commit and branch.
Preserve user work. If the checkout is dirty or another Git operation is in
progress, ask how to proceed before merging. Do not reset, stash, or clean it.

Verify that `origin` is the Mammouth fork and `upstream` is
`anomalyco/opencode`. Accept equivalent SSH and HTTPS URLs. Add `upstream` only
if missing; ask before replacing an existing remote:

```sh
git remote add upstream https://github.com/anomalyco/opencode.git
```

The normal base branch is `dev`. Fetch it without importing fork tags:

```sh
git fetch --no-tags origin refs/heads/dev:refs/remotes/origin/dev
```

Compare the checkout with `dev` and `origin/dev`. Use an up-to-date `dev` as the
upgrade base. A clean local `dev` that is strictly behind can be fast-forwarded
with `git merge --ff-only origin/dev`. Ask which base to use if branches diverge,
there are unpublished local commits, or the current branch contains unrelated
work. Create a new upgrade branch before the release merge, for example
`upgrade-2.1.2`. Keep it to at most three hyphen-separated words, without slashes
or type prefixes. Do not reset or reuse an existing branch without checking it.

## Keep upstream tags separate

Fork and upstream tags share names but can point to different commits. For
example, the fork's `v1.18.31` is its own release commit, while upstream's tag is
commit `014614d35b397775e5d397a490fc72368c894ec2`. Fork hotfix tags can also have
four numeric components, such as `v1.18.31.1`.

Fetch each needed upstream tag into `refs/upstream-tags/opencode/<tag>`, never
into the local release-tag namespace. First inspect the advertised tag and any
existing namespaced ref:

```sh
git ls-remote --tags upstream 'refs/tags/<tag>' 'refs/tags/<tag>^{}'
git show-ref --verify 'refs/upstream-tags/opencode/<tag>'
```

A missing local ref is expected on the first fetch. If one exists, compare its
object ID with the advertised tag object before fetching. Stop on a mismatch;
Git permits updates outside `refs/heads/` and `refs/tags/` even without `--force`.
Once they match, or the local ref is absent, fetch and resolve the tag:

```sh
git fetch --no-tags upstream 'refs/tags/<tag>:refs/upstream-tags/opencode/<tag>'
git rev-parse 'refs/upstream-tags/opencode/<tag>'
git rev-parse 'refs/upstream-tags/opencode/<tag>^{commit}'
```

Replace `<tag>` with the selected tag. Compare the fetched object ID with the
advertised tag object and the resolved commit with the advertised peeled ID
when present. Lightweight tags advertise the commit directly. Record the exact
target commit. Stop and report any mismatch before merging.

Use `--no-tags` on every fetch. Do not use `git fetch --tags`, `git fetch upstream
tag <tag>`, a forced tag refspec, or a plain local tag name as the merge target.
Do not create, delete, move, or push release tags. Publishing remains manual.

## Identify the previous upstream base and merge

Use source package versions and previous upgrade merge commits as clues to the
previous upstream release. In V1 the CLI version is in
`packages/opencode/package.json`; in V2 inspect the root and
`packages/cli/package.json` instead of a retained legacy package. Fetch the
previous release tag into the same separate namespace and prove its commit is
an ancestor of the starting fork commit. Do not use `git describe` or strip the
fourth component from a fork tag to infer the base. Source package versions and
fork release tags can differ.
The currently integrated upstream base is `v1.18.31`, not the fork release
`v1.18.31.1`; rediscover this for every upgrade rather than hardcoding it.

If the target commit is already an ancestor of the checkout, report that this
release is already included. Complete any additional work requested in the
comment without starting a redundant merge; otherwise finish.

Find the actual merge base between the starting fork and target, then inspect
the upstream commits on either side of the previous-release-to-target history.
Do not require the previous release tag to be an ancestor of the target: V1 and
V2 have diverged. For example, upstream `v1.18.31` and `v2.1.2` share merge base
`a97622c801f4ca571530ddc51076af659a9c32cd`; the V1-only release commit contains
version bumps. An ordinary merge preserves that ancestry even though this is
not a linear release upgrade. Distinguish upstream-only divergence from Mammouth
customizations when resolving differences.

If there is no shared history, or the graph suggests missing ancestry or a
rewritten release, investigate and ask before changing strategy. Do not copy a
release tree, squash the merge, rebase fork commits, use `--allow-unrelated-histories`,
or invent an explicit merge base.

Before merging, inspect the previous-base-to-fork diff to inventory all current
customizations, plus the previous-base-to-target changes and release notes. The
diff, not this command's list of known files, determines what must survive.

Merge the verified commit, leaving the merge uncommitted even if a fast-forward
would otherwise be possible:

```sh
git merge --no-commit --no-ff <verified-upstream-commit>
```

Keep `MERGE_HEAD` pointing to that commit so the developer's eventual merge
commit records upstream ancestry.

## Preserve and audit Mammouth behavior

Inspect unmerged paths with `git diff --name-only --diff-filter=U` and
`git ls-files -u`. Resolve content conflicts by combining upstream changes with
the fork's behavior. Inspect modify/delete conflicts individually and preserve
intentional deletions, including removed localized READMEs. When upstream moves
a module, port its Mammouth behavior and regression tests into the new location.

For a V1-to-V2 upgrade, inspect the target's active CLI, catalog/provider,
credential, config, and updater implementations before carrying patches forward.
V2 uses `packages/cli`; preserving patches only in `packages/opencode` does not
preserve behavior in the shipped V2 executable. Port every applicable Mammouth
customization into the active implementation and adapt its regression tests.
Follow the target's upstream package namespace changes rather than globally
renaming internal `@opencode/*` imports to Mammouth names. Read breaking changes,
credential/session import paths, and migration behavior for the requested major
version, and verify compatibility using isolated fixtures or copies.

Audit every custom fix against the target release, including cleanly merged
files. Inspect the original fix and upstream's replacement before dropping a
superseded implementation. Keep useful regression coverage. Pay attention to:

- The `mammouth` executable, build artifacts, installers, user-agent headers,
  branding, TUI logo/theme, help text, Docker entrypoint, and install paths.
- Mammouth config filenames and `.mammouth` directories, global data/cache paths,
  `MAMMOUTH_*` environment variables with `OPENCODE_*` compatibility, and config
  precedence. Keep upstream package names and protocol identifiers where required.
- The dynamic `mammouth-ai` catalog from `https://api.mammouth.ai/public/model/info`,
  model-family filtering, human-readable names including Claude fast variants,
  modality/context/cost metadata, the recommended default model, API-key handling,
  provider ordering, model-picker prices, and the fork's price-tier formula.
- Reasoning efforts derived from API capability flags and their variants in
  both the legacy provider and Core's model catalog. Preserve the actual provider
  request behavior when upstream changes its model or reasoning representations.
- Hiding keyless OpenCode Zen models, whose free tier rejects fork clients, while
  allowing users who supply their own key to connect.
- Fork update checks and install URLs, four-component version comparison,
  notify-by-default updates, Windows PowerShell upgrades, and avoiding detection
  of an unrelated upstream OpenCode installation. Use `specs/update-notifications.md`.
- The bundled filesystem layer-graph fix in `packages/core/src/filesystem/search.ts`.
  A successful `--version` alone did not catch the circular import in `v1.18.31`.

Preserve the fork's active `.github/workflows/release.yml` and its build/smoke
test behavior. Keep upstream workflows disabled, including newly introduced
ones, using the existing `.disabled` convention. Review renamed workflows and
their triggers rather than deleting every workflow or enabling upstream publish
automation. Keep the release workflow's Bun pin aligned with the target's root
`packageManager` and build requirements. When the active CLI moves, update the
fork workflow's build entrypoint, smoke test, archive paths, and asset names
together with the installers and updater so it actually ships the upgraded
Mammouth executable. Preserve the fork's release behavior rather than freezing
V1 paths. Do not run release/publish scripts.

Take upstream workspace version and dependency changes while preserving fork
package names, bin mappings, patches, and overrides that remain needed. These
source versions describe the upstream base; do not invent a four-component
package version or edit them to publish a fork release. Review migration changes
and report any follow-up. Regenerate clients only through the commands in
`AGENTS.md` when public API changes require it; never hand-edit generated output.

## Verify and hand off

Use the Bun version required by the target release. From the repository root,
run `bun install --frozen-lockfile`. If a merged manifest, patch, or lockfile is
inconsistent, repair it deliberately with Bun, inspect the diff, and repeat the
frozen install. Do not change dependencies just to silence installation errors.

Run focused regression tests for the affected Mammouth behavior, then the
relevant package suites and `bun typecheck` from each affected package directory.
At minimum, cover Core's model catalog/naming, the CLI's config, provider,
reasoning, installation and help behavior, and the TUI's model options and
presentation. Find the current paths and package check scripts after the merge.
Run tests and focused `bun typecheck` from package directories, never tests from
the root or `tsc` directly. Follow the target's `AGENTS.md` for a canonical full
check, such as V2's root `bun run check`. Run applicable lint and formatting
checks without reformatting unrelated files.

Build the active CLI's native release-like binary, using the selected upstream
version without its leading `v` only as the local build version. In V1 run from
`packages/opencode`; in V2 run from `packages/cli`. Inspect the target's build
script and workflow for required flags and Bun compiler pins before running:

```sh
OPENCODE_VERSION=<version> OPENCODE_CHANNEL=latest OPENCODE_RELEASE= bun run script/build.ts --single
```

Keep the embedded web UI enabled for this build. Inspect any build-generated
manifest or lock changes before keeping them. Locate the actual Mammouth output
from the merged build script; V2's upstream layout is
`packages/cli/dist/cli-<platform>-<arch>/bin/opencode` before fork adaptations.
Run the built binary's `--version` and a smoke test that initializes the real
runtime. In V1 the fork uses `debug file search package.json`; do not assume that
command still exists in V2. V2 provides `packages/cli/script/service-smoke.ts`,
which checks compiled service startup, embedded web assets, and plugin loading.
Adapt its artifact paths and Mammouth storage/config names before running
`bun run script/service-smoke.ts` from `packages/cli`, and include the equivalent
compiled startup coverage in the fork release workflow.

Use isolated temporary home, config, data, cache, and state directories so
verification cannot attach to or replace the developer's running background
service or modify installed sessions/settings. Report unavailable checks and
their actual blockers; do not claim a source-mode check verifies a compiled build.

Stage only merge resolutions and task changes, including fixes made after the
initial merge. Confirm no unmerged entries or conflict markers remain. Review
both the starting-fork-to-result diff and the target-upstream-to-result diff,
using staged and unstaged changes because `HEAD` has not advanced. Run
`git diff --check` and `git diff --cached --check`, inspect final status, and
verify `HEAD` is still the upgrade-base commit and `MERGE_HEAD` is the selected
upstream commit when a merge was needed. Leave the changes prepared for the
developer to review and commit.

Do not commit, push, open a PR, tag a release, or ask to perform those steps as
part of this command. Summarize the previous upstream base, target tag and full
commit ID, branch, conflicts resolved, custom fixes upstream now covers, behavior
retained, checks and blockers, and any migration or manual release follow-up.
Report each additional comment requirement as completed or blocked, with its
verification. Include the task page link when one was supplied. Remind the
developer that release tagging happens after the upgrade is committed and
reviewed, and tags must point to the fork's release commit rather than the
upstream commit.
