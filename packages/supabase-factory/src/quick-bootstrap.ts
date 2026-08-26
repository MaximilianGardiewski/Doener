import { randomBytes } from "node:crypto";
import { access, chmod, mkdir, open } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function createSecretFile(path: string, content: string): Promise<boolean> {
  try {
    const handle = await open(path, "wx", 0o600);
    try { await handle.writeFile(`${content}\n`, "utf8"); }
    finally { await handle.close(); }
    await chmod(path, 0o600);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export interface QuickBootstrapOptions {
  configDir?: string;
  dataDir?: string;
  projectRoot?: string;
}

export interface QuickBootstrapResult {
  configDir: string;
  dataDir: string;
  projectRoot: string;
  masterKeyFile: string;
  mcpTokenFile: string;
  createdMasterKey: boolean;
  createdMcpToken: boolean;
}

/**
 * Creates only local bootstrap directories and secret files. Existing secrets
 * are never overwritten. Most importantly, if encrypted Factory state already
 * exists while the master-key file is missing, bootstrap fails rather than
 * generating a key that could never decrypt the existing store.
 */
export async function bootstrapQuickService(options: QuickBootstrapOptions = {}): Promise<QuickBootstrapResult> {
  const configDir = options.configDir ?? "/etc/supabase-factory";
  const dataDir = options.dataDir ?? "/var/lib/supabase-factory";
  const projectRoot = options.projectRoot ?? "/srv/supabase-factory/projects";
  for (const [label, value] of [["configDir", configDir], ["dataDir", dataDir], ["projectRoot", projectRoot]] as const) {
    if (!value.startsWith("/")) throw new Error(`Factory ${label} must be absolute`);
  }

  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(projectRoot, { recursive: true, mode: 0o750 });
  await chmod(configDir, 0o700);
  await chmod(dataDir, 0o700);

  const masterKeyFile = `${configDir}/master-key`;
  const mcpTokenFile = `${configDir}/mcp-token`;
  const encryptedStore = `${dataDir}/secrets.enc.json`;

  if (!(await exists(masterKeyFile)) && await exists(encryptedStore)) {
    throw new Error(`Factory encrypted state exists at ${encryptedStore} but ${masterKeyFile} is missing; restore the original master key`);
  }

  const createdMasterKey = await createSecretFile(masterKeyFile, randomBytes(32).toString("hex"));
  const createdMcpToken = await createSecretFile(mcpTokenFile, `sbf_${randomBytes(48).toString("base64url")}`);
  await chmod(masterKeyFile, 0o600);
  await chmod(mcpTokenFile, 0o600);

  return {
    configDir,
    dataDir,
    projectRoot,
    masterKeyFile,
    mcpTokenFile,
    createdMasterKey,
    createdMcpToken,
  };
}

async function main(): Promise<void> {
  const result = await bootstrapQuickService();
  process.stdout.write(`${JSON.stringify({ status: "BOOTSTRAPPED", ...result })}\n`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Factory quick bootstrap failed";
    process.stderr.write(`SUPABASE_FACTORY_BOOTSTRAP_FAILED=${message}\n`);
    process.exitCode = 1;
  });
}
