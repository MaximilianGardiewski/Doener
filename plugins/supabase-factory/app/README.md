# Supabase Factory ChatGPT App

The ChatGPT app is the existing MCP server implemented by `packages/supabase-factory`.

## App archetype

Primary archetype: **tool-only MCP app**.

A widget is intentionally not required for V1 because the important reusable surface is the tool contract. A UI can be added later without changing the repository/Factory protocol.

## Endpoint

- Transport: MCP Streamable HTTP
- Default path: `/mcp`
- Server: `createFactoryMcpHttpHandler(...)`
- Node adapter: `mcp-node.ts`

## Authentication

The current internal/private option is `SecretStoreBearerAuthenticator`. The bearer credential belongs in Factory SecretStore or the app's protected configuration, never in GitHub or skill files.

For a broader workspace deployment, replace the authenticator with an OAuth/resource-server adapter without changing Factory tool handlers.

## Tool families

- Repository: bootstrap, validate, status, sync, plan
- Adoption: plan, prepare
- Development runtime: attach, get, list, detach
- Project lifecycle: plan, create, get, list, reconcile, destroy
- Migrations: plan, apply
- Backup/restore: create, verify, drill, apply
- Upgrade: Supabase release + PostgreSQL 17 planning/apply
- Health/audit

Only configured handlers are exposed through MCP.

## ChatGPT app configuration

When creating the custom app in ChatGPT, point it at the deployed Factory `/mcp` URL and configure the authentication method supported by that deployment. Keep the app private/internal until the end-to-end deployment and approval model have been tested.

## Plugin composition

The app should be packaged with the sibling `supabase-factory` Skill. GitHub is used by ChatGPT as the repository action layer. The Supabase app is optional and should only be required when importing/adopting an existing Supabase Cloud project.
