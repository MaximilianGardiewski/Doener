import { copyFile, cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { prepareMcelloGsapVendor } from "./vendor-mcello-gsap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "apps", "mcello", "public");
const out = path.join(root, "dist");
const ingredientDataRoot = path.join(root, "data", "mcello", "ingredients");

await prepareMcelloGsapVendor();
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(source, out, { recursive: true });
await copyGovernedIngredientAssets();
console.log(`Mcello preview built to ${out}`);

async function copyGovernedIngredientAssets() {
  const ingredients = await readdir(ingredientDataRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const destinations = new Set();

  for (const ingredient of ingredients) {
    if (!ingredient.isDirectory()) continue;
    const ingredientDir = path.join(ingredientDataRoot, ingredient.name);
    const manifestPath = path.join(ingredientDir, `${ingredient.name}.asset.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const publicPath = validatePublicPath(manifest.delivery?.publicPath, manifestPath);
    const masterPath = validateMasterPath(ingredientDir, manifest.files?.master?.path, manifestPath);
    const destination = path.join(out, publicPath.slice(1));

    if (destinations.has(destination)) {
      throw new Error(`Duplicate governed ingredient destination: ${publicPath}`);
    }
    destinations.add(destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(masterPath, destination);
  }
}

function validatePublicPath(value, manifestPath) {
  if (typeof value !== "string" || !/^\/media\/ingredients\/[a-z0-9._-]+\.png$/.test(value)) {
    throw new Error(`Invalid governed ingredient publicPath in ${manifestPath}`);
  }
  return value;
}

function validateMasterPath(ingredientDir, value, manifestPath) {
  if (typeof value !== "string" || path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".png") {
    throw new Error(`Invalid governed ingredient master path in ${manifestPath}`);
  }
  const resolved = path.resolve(ingredientDir, value);
  if (!resolved.startsWith(`${ingredientDir}${path.sep}`)) {
    throw new Error(`Governed ingredient master escapes its data directory in ${manifestPath}`);
  }
  return resolved;
}
