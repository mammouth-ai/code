import { Hono } from "hono"
import { jwtVerify, createRemoteJWKSet } from "jose"
import { createAppAuth } from "@octokit/auth-app"
import { Octokit } from "@octokit/rest"
import { Resource } from "sst"
import { parseRepositoryClaim } from "./github"

export default new Hono()
  .get("/", (c) => c.text("Hello, world!"))
  .post("/feishu", async (c) => {
    const body = (await c.req.json()) as {
      challenge?: string
      event?: {
        message?: {
          message_id?: string
          root_id?: string
          parent_id?: string
          chat_id?: string
          content?: string
        }
      }
    }
    console.log(JSON.stringify(body, null, 2))
    const challenge = body.challenge
    if (challenge) return c.json({ challenge })

    const content = body.event?.message?.content
    const parsed =
      typeof content === "string" && content.trim().startsWith("{")
        ? (JSON.parse(content) as {
            text?: string
          })
        : undefined
    const text = typeof parsed?.text === "string" ? parsed.text : typeof content === "string" ? content : ""

    let message = text.trim().replace(/^@_user_\d+\s*/, "")
    message = message.replace(/^aiden,?\s*/i, "<@759257817772851260> ")
    if (!message) return c.json({ ok: true })

    const threadId = body.event?.message?.root_id || body.event?.message?.message_id
    if (threadId) message = `${message} [${threadId}]`

    const response = await fetch(
      `https://discord.com/api/v10/channels/${Resource.DISCORD_SUPPORT_CHANNEL_ID.value}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${Resource.DISCORD_SUPPORT_BOT_TOKEN.value}`,
        },
        body: JSON.stringify({
          content: `${message}`,
        }),
      },
    )

    if (!response.ok) {
      console.error(await response.text())
      return c.json({ error: "Discord bot message failed" }, { status: 502 })
    }

    return c.json({ ok: true })
  })
  /**
   * Used by the GitHub action to get GitHub installation access token given the OIDC token
   */
  .post("/exchange_github_app_token", async (c) => {
    const EXPECTED_AUDIENCE = "opencode-github-action"
    const GITHUB_ISSUER = "https://token.actions.githubusercontent.com"
    const JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`

    // get Authorization header
    const token = c.req.header("Authorization")?.replace(/^Bearer /, "")
    if (!token) return c.json({ error: "Authorization header is required" }, { status: 401 })

    // verify token
    const JWKS = createRemoteJWKSet(new URL(JWKS_URL))
    let repository: ReturnType<typeof parseRepositoryClaim>
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: GITHUB_ISSUER,
        audience: EXPECTED_AUDIENCE,
      })
      repository = parseRepositoryClaim(payload)
    } catch (err) {
      console.error("Token verification failed:", err)
      return c.json({ error: "Invalid or expired token" }, { status: 403 })
    }

    try {
      const auth = createAppAuth({
        appId: Resource.GITHUB_APP_ID.value,
        privateKey: Resource.GITHUB_APP_PRIVATE_KEY.value,
      })
      const appAuth = await auth({ type: "app" })
      const octokit = new Octokit({ auth: appAuth.token })
      const { data: installation } = await octokit.apps.getRepoInstallation({
        owner: repository.owner,
        repo: repository.repo,
      })
      const installationAuth = await auth({
        type: "installation",
        installationId: installation.id,
      })
      return c.json({ token: installationAuth.token })
    } catch (error) {
      console.error("GitHub App token exchange failed:", error)
      return c.json(
        { error: `Failed to exchange GitHub App token for ${repository.owner}/${repository.repo}` },
        { status: 502 },
      )
    }
  })
  /**
   * Used by the GitHub action to get GitHub installation access token given user PAT token (used when testing `opencode github run` locally)
   */
  .post("/exchange_github_app_token_with_pat", async (c) => {
    const body = await c.req.json<{ owner: string; repo: string }>()
    const owner = body.owner
    const repo = body.repo

    try {
      // get Authorization header
      const authHeader = c.req.header("Authorization")
      const token = authHeader?.replace(/^Bearer /, "")
      if (!token) throw new Error("Authorization header is required")

      // Verify permissions
      const userClient = new Octokit({ auth: token })
      const { data: repoData } = await userClient.repos.get({ owner, repo })
      if (!repoData.permissions.admin && !repoData.permissions.push && !repoData.permissions.maintain)
        throw new Error("User does not have write permissions")

      // Get installation token
      const auth = createAppAuth({
        appId: Resource.GITHUB_APP_ID.value,
        privateKey: Resource.GITHUB_APP_PRIVATE_KEY.value,
      })
      const appAuth = await auth({ type: "app" })

      // Lookup installation
      const appClient = new Octokit({ auth: appAuth.token })
      const { data: installation } = await appClient.apps.getRepoInstallation({
        owner,
        repo,
      })

      // Get installation token
      const installationAuth = await auth({
        type: "installation",
        installationId: installation.id,
      })

      return c.json({ token: installationAuth.token })
    } catch (e: any) {
      let error = e
      if (e instanceof Error) {
        error = e.message
      }

      return c.json({ error }, { status: 401 })
    }
  })
  .all("*", (c) => c.text("Not Found", 404))
