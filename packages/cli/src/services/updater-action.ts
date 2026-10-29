export type Policy = "disable" | "notify" | "auto"
export type Action = "none" | "notify" | "auto"

const maximumComponent = "9007199254740991"
const versionPattern =
  /^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:\.([0-9]+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function action(current: string, latest: string, policy: Policy): Action {
  if (policy === "disable") return "none"
  const currentVersion = parseReleaseVersion(current)
  const latestVersion = parseReleaseVersion(latest)
  if (!currentVersion || !latestVersion || compareVersions(latest, current) <= 0) return "none"
  if (
    policy === "auto" &&
    (currentVersion.major !== latestVersion.major || currentVersion.minor !== latestVersion.minor)
  )
    return "notify"
  return policy
}

export function parseReleaseVersion(input: string) {
  if (input.length > 256) return
  const match = input.trim().match(versionPattern)
  if (!match) return
  if ([match[1], match[2], match[3], ...(match[4] ? [match[4]] : [])].some(invalidComponent)) return
  if (
    match[5]
      ?.split(".")
      .some((identifier) => identifier.length > 1 && identifier.startsWith("0") && /^[0-9]+$/.test(identifier))
  )
    return
  return {
    major: match[1],
    minor: match[2],
    core: `${match[1]}.${match[2]}.${match[3]}.${match[4] ?? "0"}`,
    prerelease: match[5]?.split(".") ?? [],
  }
}

export function compareVersions(left: string, right: string) {
  const a = parseReleaseVersion(left)
  const b = parseReleaseVersion(right)
  if (!a || !b) return 0
  const segments = a.core.split(".").map(Number)
  const other = b.core.split(".").map(Number)
  for (const [index, value] of segments.entries()) {
    if (value !== other[index]) return value > other[index] ? 1 : -1
  }
  if (!a.prerelease.length || !b.prerelease.length) return Number(!a.prerelease.length) - Number(!b.prerelease.length)
  for (const [index, value] of a.prerelease.entries()) {
    const target = b.prerelease[index]
    if (target === undefined) return 1
    if (value === target) continue
    const numeric = /^\d+$/.test(value)
    const targetNumeric = /^\d+$/.test(target)
    if (numeric && targetNumeric) {
      if (Number(value) !== Number(target)) return Number(value) > Number(target) ? 1 : -1
      continue
    }
    if (numeric !== targetNumeric) return numeric ? -1 : 1
    return value > target ? 1 : -1
  }
  return a.prerelease.length === b.prerelease.length ? 0 : -1
}

function invalidComponent(value: string) {
  if (value.length > 1 && value.startsWith("0")) return true
  if (value.length !== maximumComponent.length) return value.length > maximumComponent.length
  return value > maximumComponent
}
