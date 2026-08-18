import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcelloPackagePath = path.join(root, "apps", "mcello", "package.json");
const requireFromMcello = createRequire(mcelloPackagePath);

export const MCELLO_GSAP_VERSION = "3.15.0";
export const MCELLO_GSAP_VENDOR_FILES = Object.freeze([
  "gsap.min.js",
  "ScrollTrigger.min.js",
  "Flip.min.js",
]);
export const MCELLO_GSAP_VENDOR_PUBLIC_PATH = "/vendor/gsap";

function gsapPackageJsonPath() {
  return requireFromMcello.resolve("gsap/package.json");
}

async function verifiedGsapPackage() {
  const packagePath = gsapPackageJsonPath();
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.version !== MCELLO_GSAP_VERSION) {
    throw new Error(
      `Mcello GSAP version mismatch: expected ${MCELLO_GSAP_VERSION}, got ${packageJson.version || "unknown"}`,
    );
  }
  return { packagePath, packageJson };
}

export async function prepareMcelloGsapVendor(targetDir = path.join(
  root,
  "apps",
  "mcello",
  "public",
  "vendor",
  "gsap",
)) {
  const { packagePath, packageJson } = await verifiedGsapPackage();
  const distDir = path.join(path.dirname(packagePath), "dist");

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  for (const file of MCELLO_GSAP_VENDOR_FILES) {
    await copyFile(path.join(distDir, file), path.join(targetDir, file));
  }

  await writeFile(
    path.join(targetDir, "vendor-manifest.json"),
    `${JSON.stringify({
      package: "gsap",
      version: packageJson.version,
      license: packageJson.license,
      files: MCELLO_GSAP_VENDOR_FILES,
      source: "installed npm package; local same-origin runtime only",
    }, null, 2)}\n`,
    "utf8",
  );

  return {
    targetDir,
    version: packageJson.version,
    files: [...MCELLO_GSAP_VENDOR_FILES],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareMcelloGsapVendor();
  console.log(`Mcello GSAP ${result.version} vendored: ${result.files.join(", ")}`);
}
