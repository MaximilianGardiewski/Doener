import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const chatgptDoc = fs.readFileSync(new URL('../docs/chatgpt-notebook-mcp.md', import.meta.url), 'utf8');
const codexDoc = fs.readFileSync(new URL('../docs/integrations/CODEX_GEMINI_NOTEBOOK_BRIDGE.md', import.meta.url), 'utf8');
const codexScript = fs.readFileSync(new URL('../scripts/setup-codex-notebook-mcp.ps1', import.meta.url), 'utf8');
const retiredChatgptDesktopScript = fs.readFileSync(new URL('../scripts/setup-chatgpt-desktop-mcp.ps1', import.meta.url), 'utf8');

test('ChatGPT and Codex MCP registration paths stay separate', () => {
  assert.equal(pkg.scripts['research:chatgpt:desktop'], undefined);
  assert.equal(pkg.scripts['research:chatgpt:desktop:remove'], undefined);
  assert.match(pkg.scripts['research:codex:register'], /setup-codex-notebook-mcp\.ps1/);
  assert.match(pkg.scripts['research:codex:remove'], /setup-codex-notebook-mcp\.ps1 -Remove/);

  assert.match(codexScript, /Codex-only registration/i);
  assert.match(codexScript, /normal ChatGPT chats do NOT read this Codex MCP registration/i);
  assert.match(codexScript, /http:\/\/127\.0\.0\.1:\$Port\/mcp/);

  // The historical filename remains only as a fail-closed tombstone so stale
  // local instructions cannot silently configure the wrong client.
  assert.match(retiredChatgptDesktopScript, /RETIRED \/ FAIL-CLOSED COMPATIBILITY TOMBSTONE/);
  assert.match(retiredChatgptDesktopScript, /This script is retired and intentionally makes no changes/);
  assert.match(retiredChatgptDesktopScript, /research:codex:register/);
  assert.match(retiredChatgptDesktopScript, /Custom App \+ OpenAI Secure MCP Tunnel/);
  assert.match(retiredChatgptDesktopScript, /\bthrow\b/);
  assert.doesNotMatch(retiredChatgptDesktopScript, /^\s*Set-Content\b/m);
  assert.doesNotMatch(retiredChatgptDesktopScript, /^\s*Start-Process\b/m);

  assert.match(chatgptDoc, /Custom App \+ Secure MCP Tunnel/);
  assert.match(chatgptDoc, /normaler ChatGPT-Chat\s*\|\s*nein/);
  assert.doesNotMatch(chatgptDoc, /Empfehlung:\s*der Desktop-Weg/i);

  assert.match(codexDoc, /Codex-only/i);
  assert.match(codexDoc, /does \*\*not\*\* make the MCP server available to ordinary ChatGPT conversations/i);
});
