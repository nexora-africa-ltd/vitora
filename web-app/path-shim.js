/**
 * Minimal browser-safe shim for Node's `path` module.
 * Used by Turbopack aliasing when client bundles reference path helpers.
 */

function normalizeSlashes(value) {
  return String(value || "").replace(/\\+/g, "/");
}

function join(...parts) {
  const filtered = parts
    .map((part) => normalizeSlashes(part).trim())
    .filter(Boolean);

  return filtered.join("/").replace(/\/+/g, "/");
}

function dirname(input) {
  const value = normalizeSlashes(input);
  if (!value) return ".";

  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
  const index = trimmed.lastIndexOf("/");

  if (index <= 0) return index === 0 ? "/" : ".";
  return trimmed.slice(0, index);
}

function basename(input) {
  const value = normalizeSlashes(input);
  if (!value) return "";
  const trimmed = value.endsWith("/") ? value.slice(0, -1) : value;
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

function extname(input) {
  const file = basename(input);
  const index = file.lastIndexOf(".");
  if (index <= 0) return "";
  return file.slice(index);
}

const api = {
  sep: "/",
  delimiter: ":",
  join,
  dirname,
  basename,
  extname,
  normalize: normalizeSlashes,
  resolve: (...parts) => join(...parts),
};

module.exports = api;
module.exports.default = api;
