#!/usr/bin/env node
// Fill keys that are absent. Existing values, including nested objects, stay.
const fs = require("fs");

function fill(target, source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    return target === undefined ? source : target;
  }
  const base = target && typeof target === "object" && !Array.isArray(target) ? target : {};
  const out = { ...base };
  for (const key of Object.keys(source)) {
    if (out[key] === undefined) out[key] = source[key];
    else if (
      source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) &&
      out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
    ) {
      out[key] = fill(out[key], source[key]);
    }
  }
  return out;
}

function mergeJsonDefaults(dest, defaults) {
  let current = {};
  if (fs.existsSync(dest)) {
    try {
      current = JSON.parse(fs.readFileSync(dest, "utf8"));
    } catch {
      current = {};
    }
  }
  const merged = fill(current, defaults);
  fs.writeFileSync(dest, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

if (require.main === module) {
  const [dest, defaultsPath] = process.argv.slice(2);
  if (!dest || !defaultsPath) {
    console.error("usage: merge-json-defaults.cjs <dest.json> <defaults.json>");
    process.exit(1);
  }
  mergeJsonDefaults(dest, JSON.parse(fs.readFileSync(defaultsPath, "utf8")));
}

module.exports = { fill, mergeJsonDefaults };
