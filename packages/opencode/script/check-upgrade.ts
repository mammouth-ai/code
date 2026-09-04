// Drives the startup update check (cli/upgrade.ts) without a TTY and prints the global
// events it emits. Bake in an installed version to simulate a release binary:
//   bun run --define 'OPENCODE_VERSION:"1.17.11.1"' --define 'OPENCODE_CHANNEL:"latest"' script/check-upgrade.ts
import { GlobalBus } from "@/bus/global"
import { upgrade } from "@/cli/upgrade"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"

GlobalBus.on("event", (event) => console.log(event.directory, event.payload.type, event.payload.properties?.version))
console.log("installed", InstallationVersion, InstallationChannel)
await upgrade()
process.exit(0)
