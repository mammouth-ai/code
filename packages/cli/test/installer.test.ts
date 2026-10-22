import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "./fixture/tmpdir"

// This fixture exercises the Linux shell installer and uses Linux command paths.
test.skipIf(process.platform !== "linux").each(["zsh", "fish"])(
  "installs the Mammouth baseline-musl archive and configures a fresh %s home",
  async (shell) => {
    await using root = await tmpdir()
    const bin = path.join(root.path, "commands")
    const artifact = path.join(root.path, "mammouth-linux-x64-baseline-musl", "bin")
    await Promise.all([fs.mkdir(bin), fs.mkdir(artifact, { recursive: true })])
    await Bun.write(path.join(artifact, "mammouth"), "#!/bin/sh\nexit 0\n")
    const archive = path.join(root.path, "artifact.tar.gz")
    const packaged = Bun.spawnSync(["tar", "-czf", archive, "-C", root.path, "mammouth-linux-x64-baseline-musl"])
    expect(packaged.exitCode).toBe(0)
    const commands = {
      uname: '#!/bin/sh\nif [ "$1" = "-m" ]; then printf x86_64; else printf Linux; fi\n',
      ldd: "#!/bin/sh\nprintf musl\n",
      grep: '#!/bin/sh\nif [ "$2" = "avx2" ]; then exit 1; fi\nexec /usr/bin/grep "$@"\n',
      curl: '#!/bin/sh\nfor arg in "$@"; do case "$arg" in https:*) printf "%s\\n" "$arg" >> "$INSTALL_REQUESTS" ;; esac; done\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-o" ]; then cp "$INSTALL_ARCHIVE" "$2"; exit; fi; shift; done\nexit 1\n',
    }
    await Promise.all(
      Object.entries(commands).map(async ([name, content]) => {
        await Bun.write(path.join(bin, name), content)
        await fs.chmod(path.join(bin, name), 0o755)
      }),
    )
    const requests = path.join(root.path, "requests")
    const child = Bun.spawn(["bash", path.resolve(import.meta.dir, "../../../install.sh")], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root.path,
        SHELL: `/bin/${shell}`,
        VERSION: "2.1.2.1",
        INSTALL_ARCHIVE: archive,
        INSTALL_REQUESTS: requests,
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ code, errors }).toEqual({ code: 0, errors: "" })
    expect(output).toContain("Mammouth Code v2.1.2.1")
    expect(await Bun.file(requests).text()).toBe(
      "https://github.com/mammouth-ai/code/releases/download/v2.1.2.1/mammouth-linux-x64-baseline-musl.tar.gz\n",
    )
    expect(await Bun.file(path.join(root.path, ".mammouth", "bin", "mammouth")).exists()).toBe(true)
    const profile = shell === "zsh" ? ".zshrc" : ".config/fish/config.fish"
    expect(await Bun.file(path.join(root.path, profile)).text()).toContain(".mammouth/bin")
  },
)
