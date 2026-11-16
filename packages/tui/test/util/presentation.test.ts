import { expect, test } from "bun:test"
import { epilogue } from "../../src/util/presentation"

const rows = (text: string | undefined) =>
  Bun.stripANSI(text ?? "")
    .split("\n")
    .filter((line) => line.trim() && !/[▀▄█]/.test(line))

test("prints nothing without a session or update", () => {
  expect(epilogue({})).toBeUndefined()
})

test("formats session continuation summary", () => {
  const text = epilogue({ session: { title: "A session", sessionID: "ses_123" } })
  expect(text).toContain("\x1b[38;2;159;108;69m███    ███")
  expect(rows(text)).toEqual(["  Session   A session", "  Continue  mammouth -s ses_123"])
})

test("tells the user to start Mammouth again after an update", () => {
  expect(rows(epilogue({ updatedVersion: "2.0.0" }))).toEqual(["  Run mammouth to use 2.0.0"])
})

test("keeps the session continuation after an update", () => {
  expect(rows(epilogue({ session: { title: "A session", sessionID: "ses_123" }, updatedVersion: "2.0.0" }))).toEqual([
    "  Run mammouth to use 2.0.0",
    "  Session   A session",
    "  Continue  mammouth -s ses_123",
  ])
})
