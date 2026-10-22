import { describe, expect, test } from "bun:test"
import { action } from "./updater-action"
import { decodePolicy, installerCommand } from "./updater"

describe("updater", () => {
  test("runs the Windows installer as a PowerShell file and passes four-component versions", () => {
    const command = installerCommand("win32", "C:\\Temp\\install.ps1", "2.1.2.1")
    expect(command.command).toBe("powershell")
    expect(command.args).toEqual(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "C:\\Temp\\install.ps1"])
    expect(command.options.env?.VERSION).toBe("2.1.2.1")
    const unix = installerCommand("linux", "/tmp/install.sh", "2.1.2")
    expect(unix.command).toBe("bash")
    expect(unix.args).toEqual(["/tmp/install.sh"])
  })
  test("reads update policy from JSONC", () => {
    expect(decodePolicy('{ // preference\n "update": "notify",\n}')).toBe("notify")
    expect(decodePolicy('{ "update": "disable" }')).toBe("disable")
    expect(decodePolicy('{ "update": "auto" }')).toBe("auto")
    expect(decodePolicy('{ "update": "invalid" }')).toBeUndefined()
  })

  test("maps the v1 update policy", () => {
    expect(decodePolicy('{ "autoupdate": false }')).toBe("disable")
    expect(decodePolicy('{ "autoupdate": "notify" }')).toBe("notify")
    expect(decodePolicy('{ "autoupdate": true }')).toBe("auto")
  })

  test("reports every available release", () => {
    expect(action("1.2.3", "1.2.4", "notify")).toBe("notify")
    expect(action("1.2.3", "1.3.0", "notify")).toBe("notify")
    expect(action("1.2.3", "2.0.0", "notify")).toBe("notify")
    expect(action("1.2.3", "1.2.3", "notify")).toBe("none")
  })

  test("automatically installs every available release when enabled", () => {
    expect(action("1.2.3", "1.2.4", "auto")).toBe("auto")
    expect(action("1.2.3", "1.2.3", "auto")).toBe("none")
  })

  test("skips when updates are disabled", () => {
    expect(action("1.2.3", "1.2.4", "disable")).toBe("none")
  })

  test("reports up-to-date only when versions match", () => {
    expect(action("1.2.3", "1.2.3", "notify")).toBe("none")
  })

  test("does not downgrade a newer installation", () => {
    expect(action("1.2.4", "1.2.3", "notify")).toBe("none")
  })

  test("accepts strict release version variants", () => {
    expect(action("v1.2.3", " 1.2.4\n", "notify")).toBe("notify")
    expect(action("1.2.3-alpha.1", "1.2.3-alpha.2", "notify")).toBe("notify")
    expect(action("0.0.0-dev-17403", "0.0.0-dev-17403.2", "notify")).toBe("notify")
    expect(action("0.0.0-next-17403", "0.0.0-beta-17404", "notify")).toBe("none")
    expect(action("1.2.3+old", "1.2.3+new", "notify")).toBe("none")
    expect(action("v1.2.3+old", "1.2.3", "notify")).toBe("none")
  })

  test("preserves strict validity", () => {
    const invalid = [
      "=1.2.3",
      "V1.2.3",
      "1.2",
      "01.2.3",
      "1.02.3",
      "1.2.03",
      "1.2.3-01",
      "1.2.3-",
      "1.2.3+",
      "1.2.3-alpha..1",
      "1.2.3_alpha",
      "9007199254740992.0.0",
      "0.9007199254740992.0",
      "0.0.9007199254740992",
    ]
    invalid.forEach((version) => expect(action("1.2.3", version, "notify"), version).toBe("none"))
  })

  test("handles numeric limits without losing precision", () => {
    expect(action("9007199254740991.0.0", "9007199254740991.0.1", "notify")).toBe("notify")
    expect(action("9007199254740990.0.0", "9007199254740991.0.0", "notify")).toBe("notify")
  })

  test("supports Mammouth hotfix versions and only silently installs patches", () => {
    expect(action("1.18.31", "1.18.31.1", "notify")).toBe("notify")
    expect(action("1.18.31.1", "1.18.31.2", "auto")).toBe("auto")
    expect(action("1.18.31.2", "1.18.31", "notify")).toBe("none")
    expect(action("1.18.31.1", "1.19.0", "auto")).toBe("notify")
    expect(action("1.18.31.1", "2.1.2", "auto")).toBe("notify")
  })

  test("preserves equality for oversized numeric prerelease identifiers", () => {
    expect(action("1.0.0-9007199254740992", "1.0.0-9007199254740993", "notify")).toBe("none")
    expect(action("1.0.0-9007199254740991", "1.0.0-9007199254740992", "notify")).toBe("notify")
  })

  test("rejects versions longer than semver's limit before trimming", () => {
    expect(action("1.2.3", `${" ".repeat(251)}1.2.3`, "notify")).toBe("none")
    expect(action("1.2.3", `1.2.4+${"a".repeat(250)}`, "notify")).toBe("notify")
  })
})
