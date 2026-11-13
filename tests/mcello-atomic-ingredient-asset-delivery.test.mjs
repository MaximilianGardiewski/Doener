import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const ingredientRoot = path.join(root, "data", "mcello", "ingredients");
const buildSource = await readFile(path.join(root, "scripts", "build-preview.mjs"), "utf8");
const serverSource = await readFile(path.join(root, "apps", "mcello", "server.mjs"), "utf8");
const ingredients = await loadIngredients();

test("every governed ingredient has one atomic visual manifest without commerce truth", () => {
  assert.ok(ingredients.length > 0, "at least one governed atomic ingredient is required");
  assert.equal(new Set(ingredients.map(({ manifest }) => manifest.assetId)).size, ingredients.length, "asset IDs must be unique");
  assert.equal(new Set(ingredients.map(({ manifest }) => manifest.delivery.publicPath)).size, ingredients.length, "public paths must be unique");

  for (const { slug, manifest } of ingredients) {
    assert.equal(manifest.formatVersion, 1, `${slug}: unsupported manifest format`);
    assert.equal(manifest.ingredient, slug, `${slug}: ingredient must match its directory`);
    assert.match(manifest.assetId, /^ingredient\.[a-z0-9.]+$/);
    /*
     * Two governed visual languages coexist while D076 replaces D075: an atomic
     * piece that the stage repeats, and a finished layer the stage places once.
     * Both keep exactly one canonical master; only the instantiation differs.
     */
    const stacked = manifest.status.visualLanguageDecision === "D076";
    assert.equal(manifest.visual.role, stacked ? "stacked-configurator-layer" : "atomic-configurator-ingredient");
    assert.match(manifest.visual.subject, stacked ? /^layer-/ : /^exactly-one-/);
    assert.equal(manifest.visual.instancePolicy.canonicalMasterCount, 1);
    assert.equal(
      manifest.visual.instancePolicy.frontendInstantiation,
      stacked ? "single-layer-instance" : "repeat-the-same-master",
    );
    assert.equal(manifest.visual.instancePolicy.separateExtraAssetAllowed, stacked);
    assert.equal(manifest.status.decision, "D068");
    assert.ok(
      ["D075", "D076"].includes(manifest.status.visualLanguageDecision),
      `${slug}: unknown visual language decision ${manifest.status.visualLanguageDecision}`,
    );
    assert.equal(manifest.status.documentaryMcelloReality, false);
    assert.equal(manifest.status.lifecycle, "provisional");
    assert.equal(manifest.delivery.publicPath, `/media/ingredients/${manifest.assetId}.png`);
    assert.equal(manifest.delivery.browserAdobeApiCalls, false);

    const manifestKeys = collectKeys(manifest);
    for (const forbidden of ["price", "currency", "availability", "modifier", "commerce"]) {
      assert.ok(!manifestKeys.some((key) => key.toLowerCase().includes(forbidden)), `${slug}: ${forbidden} data must stay out of the visual manifest`);
    }
  }
});

test("each source and sole canonical master matches its recorded PNG contract", async () => {
  for (const { directory, manifest, slug } of ingredients) {
    const masterPath = governedFile(directory, manifest.files.master.path);
    const sourcePath = governedFile(directory, manifest.files.source.path);
    const [master, source] = await Promise.all([readFile(masterPath), readFile(sourcePath)]);
    const masterContract = readPngContract(master);
    const sourceContract = readPngContract(source);

    assert.deepEqual(masterContract, { width: 1024, height: 1024, bitDepth: 8, colorType: 6, interlace: 0 }, `${slug}: master must be a non-interlaced 1024px RGBA PNG`);
    assert.equal(sourceContract.width, manifest.files.source.width, `${slug}: source width drifted`);
    assert.equal(sourceContract.height, manifest.files.source.height, `${slug}: source height drifted`);
    assert.equal(sourceContract.bitDepth, manifest.files.source.bitDepth, `${slug}: source bit depth drifted`);
    assert.equal(manifest.files.master.width, masterContract.width);
    assert.equal(manifest.files.master.height, masterContract.height);
    assert.equal(manifest.files.master.bitDepth, masterContract.bitDepth);
    assert.equal(manifest.files.master.pngColorType, "RGBA");
    assert.equal(manifest.files.master.transparent, true);
    assert.equal(manifest.files.master.canvas, "square");
    assert.equal(manifest.files.master.bytes, master.length);
    assert.equal(manifest.files.source.bytes, source.length);
    assert.equal(sha256(master), manifest.files.master.sha256);
    assert.equal(sha256(source), manifest.files.source.sha256);

    const alpha = pngAlphaRange(master);
    assert.equal(alpha.min, 0, `${slug}: master needs transparent canvas pixels`);
    assert.ok(alpha.max > 0, `${slug}: master must contain a visible subject`);

    const images = (await listFiles(directory)).filter((file) => /\.(?:png|webp|jpe?g|avif)$/i.test(file));
    assert.deepEqual(images.sort(), [manifest.files.master.path, manifest.files.source.path].sort(), `${slug}: only one source and one canonical master image are allowed`);
    /*
     * Under D075 an "extra" selection was only ever more instances of the same
     * master, so a file named extra proved a forbidden second asset. D076 makes
     * the extra tomato row its own governed layer, so the ban narrows to the
     * families that still repeat one master.
     */
    const variantBan = manifest.status.visualLanguageDecision === "D076"
      ? /(?:^|[._ -])(?:combo|mixed|front|back)(?:[._ -]|$)/i
      : /(?:^|[._ -])(?:extra|combo|mixed|front|back)(?:[._ -]|$)/i;
    assert.ok(images.every((file) => !variantBan.test(path.basename(file))), `${slug}: no combo/front/back asset variants are allowed`);

    await assert.rejects(
      access(path.join(root, "apps", "mcello", "public", "media", "ingredients", `${manifest.assetId}.png`)),
      { code: "ENOENT" },
    );
  }
});

test("preview build maps every governed master to its manifest path without conversion", () => {
  assert.match(buildSource, /copyGovernedIngredientAssets/);
  assert.match(buildSource, /manifest\.delivery\?\.publicPath/);
  assert.match(buildSource, /manifest\.files\?\.master\?\.path/);
  assert.match(buildSource, /await copyFile\(masterPath, destination\)/);
  assert.ok(
    buildSource.indexOf("await cp(source, out") < buildSource.indexOf("await copyGovernedIngredientAssets()"),
    "governed assets must be added after the tracked public tree is copied",
  );
  assert.doesNotMatch(buildSource, /webp|sharp|imagemagick|canvas/i);
});

test("development server serves every canonical data master at its stable public URL", async () => {
  const port = await reservePort();
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/mcello/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child, port);
    for (const { directory, manifest, slug } of ingredients) {
      const masterPath = governedFile(directory, manifest.files.master.path);
      const [master, response, head] = await Promise.all([
        readFile(masterPath),
        fetch(`http://127.0.0.1:${port}${manifest.delivery.publicPath}`),
        fetch(`http://127.0.0.1:${port}${manifest.delivery.publicPath}`, { method: "HEAD" }),
      ]);
      assert.equal(response.status, 200, `${slug}: GET failed`);
      assert.equal(head.status, 200, `${slug}: HEAD failed`);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(Number(response.headers.get("content-length")), master.length);
      assert.equal(Number(head.headers.get("content-length")), master.length);
      const delivered = Buffer.from(await response.arrayBuffer());
      assert.equal(sha256(delivered), sha256(master));
    }
  } finally {
    child.kill();
  }

  assert.match(serverSource, /loadGovernedIngredientMedia/);
  assert.match(serverSource, /manifest\.delivery\?\.publicPath/);
  assert.match(serverSource, /manifest\.files\?\.master\?\.path/);
  assert.doesNotMatch(serverSource, /firefly\.adobe\.com|adobe_mandatory_init|image_generate/);
});

test("Adobe provenance never becomes a browser runtime dependency", async () => {
  const publicRoot = path.join(root, "apps", "mcello", "public");
  const runtimeFiles = (await listFiles(publicRoot))
    .filter((file) => /\.(?:html|css|js|json|webmanifest)$/i.test(file));
  for (const file of runtimeFiles) {
    const source = await readFile(path.join(publicRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /firefly\.adobe\.com|photoshop-mcp-service\.adobe\.io|adobe_mandatory_init|image_generate|image_remove_background/,
      `${file}: Adobe creative APIs belong to the offline asset workflow, never the browser`,
    );
  }
});

async function loadIngredients() {
  const entries = await readdir(ingredientRoot, { withFileTypes: true });
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(ingredientRoot, entry.name);
    const manifestPath = path.join(directory, `${entry.name}.asset.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    rows.push({ slug: entry.name, directory, manifestPath, manifest });
  }
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

function governedFile(directory, relative) {
  assert.equal(typeof relative, "string");
  assert.equal(path.isAbsolute(relative), false);
  const resolved = path.resolve(directory, relative);
  assert.ok(resolved.startsWith(`${directory}${path.sep}`), "governed file escapes ingredient directory");
  return resolved;
}

function collectKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nested, keys);
  }
  return keys;
}

function readPngContract(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "asset must be a PNG");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR", "PNG must start with IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlace: buffer[28],
  };
}

function pngAlphaRange(buffer) {
  const { width, height, bitDepth, colorType, interlace } = readPngContract(buffer);
  assert.deepEqual({ bitDepth, colorType, interlace }, { bitDepth: 8, colorType: 6, interlace: 0 });
  const idat = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  let previous = Buffer.alloc(stride);
  let cursor = 0;
  let min = 255;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const encoded = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const row = Buffer.allocUnsafe(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      const value = encoded[x];
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else assert.fail(`unsupported PNG filter ${filter}`);
    }
    for (let x = 3; x < stride; x += 4) {
      min = Math.min(min, row[x]);
      max = Math.max(max, row[x]);
    }
    previous = row;
  }
  return { min, max };
}

function paeth(left, up, upLeft) {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const diagonalDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  if (upDistance <= diagonalDistance) return up;
  return upLeft;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(child, port) {
  let output = "";
  const append = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Mcello server exited before readiness:\n${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The server socket is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Mcello server:\n${output}`);
}
