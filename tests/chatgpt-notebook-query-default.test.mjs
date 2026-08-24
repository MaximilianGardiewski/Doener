import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

const scripts = pkg.scripts;

const QUERY_COMMANDS = [
  "research:chatgpt",
  "research:chatgpt:bg",
  "research:chatgpt:setup",
  "research:chatgpt:tunnel",
];

test("standard ChatGPT Notebook workflows explicitly use query mode", () => {
  for (const name of QUERY_COMMANDS) {
    assert.match(
      scripts[name],
      /(?:^|\s)-Mode query(?:\s|$)/,
      `${name} must explicitly select query mode`,
    );
  }

  assert.match(
    scripts["research:chatgpt:check"],
    /(?:^|\s)--mode query(?:\s|$)/,
    "the live checker must validate the same query profile the standard bridge exposes",
  );
});

test("explicit read-only escape hatches stay available", () => {
  assert.match(scripts["research:chatgpt:readonly"], /(?:^|\s)-Mode readonly(?:\s|$)/);
  assert.match(scripts["research:chatgpt:tunnel:readonly"], /(?:^|\s)-Mode readonly(?:\s|$)/);
});
