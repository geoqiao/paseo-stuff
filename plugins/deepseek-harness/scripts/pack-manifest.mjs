import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const stateDir = join(root, "scripts", ".pack-state");
const pluginManifest = join(root, "paseo-plugin.json");
const packageManifest = join(root, "package.json");
const pluginBackup = join(stateDir, "paseo-plugin.json");
const packageBackup = join(stateDir, "package.json");
const pluginTemp = join(stateDir, "paseo-plugin.json.tmp");
const packageTemp = join(stateDir, "package.json.tmp");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(path, content) {
  const temporary = `${path}.pack-tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function restore() {
  const hasPluginBackup = await exists(pluginBackup);
  const hasPackageBackup = await exists(packageBackup);
  if (!hasPluginBackup && !hasPackageBackup) {
    await rm(stateDir, { recursive: true, force: true });
    return;
  }

  if (hasPluginBackup) {
    await copyFile(pluginBackup, pluginTemp);
    await rename(pluginTemp, pluginManifest);
  }
  if (hasPackageBackup) {
    await copyFile(packageBackup, packageTemp);
    await rename(packageTemp, packageManifest);
  }
  await rm(stateDir, { recursive: true, force: true });
}

async function prepare() {
  if (await exists(stateDir)) await restore();

  await mkdir(stateDir, { recursive: true });
  try {
    await copyFile(pluginManifest, pluginTemp);
    await copyFile(packageManifest, packageTemp);
    await rename(pluginTemp, pluginBackup);
    await rename(packageTemp, packageBackup);

    const plugin = JSON.parse(await readFile(pluginManifest, "utf8"));
    const pkg = JSON.parse(await readFile(packageManifest, "utf8"));
    delete plugin.build;
    delete pkg.private;
    delete pkg.devDependencies;
    delete pkg.scripts;

    await atomicWrite(pluginManifest, `${JSON.stringify(plugin, null, 2)}\n`);
    await atomicWrite(packageManifest, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (error) {
    try {
      await restore();
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], "Pack manifest preparation failed and automatic restoration was incomplete.");
    }
    throw error;
  }
}

const action = process.argv[2];
if (action === "prepare") {
  await prepare();
} else if (action === "restore") {
  await restore();
} else {
  throw new Error("Usage: node scripts/pack-manifest.mjs <prepare|restore>");
}
