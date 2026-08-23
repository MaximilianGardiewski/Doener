import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const chatgptDoc = fs.readFileSync(new URL('../docs/chatgpt-notebook-mcp.md', import.meta.url), 'utf8');
const codexDoc = fs.readFileSync(new URL('../docs/integrations/CODEX_GEMINI_NOTEBOOK_BRIDGE.md', import.meta.url), 'utf8');

test('ChatGPT and Codex MCP registration paths stay separate', () => {
  assert.equal(pkg.scripts['research:chatgpt:desktop'], undefined);
  assert.equal(pkg.scripts['research:chatgpt:desktop:remove'], undefined);
  assert.match(pkg.scripts['research:codex:register'], /setup-codex-notebook-mcp\.ps1/);
  assert.match(pkg.scripts['research:codex:remove'], /setup-codex-notebook-mcp\.ps1 -Remove/);

  assert.equal(
    fs.existsSync(new URL('../scripts/setup-chatgpt-desktop-mcp.ps1', import.meta.url)),
    false,
    'the misleading ChatGPT-desktop registration script must not return',
  );

  assert.match(chatgptDoc, /Custom App \+ Secure MCP Tunnel/);
  assert.match(chatgptDoc, /normaler ChatGPT-Chat\s*\|\s*nein/);
  assert.doesNotMatch(chatgptDoc, /Empfehlung:\s*der Desktop-Weg/i);

  assert.match(codexDoc, /Codex-only/i);
  assert.match(codexDoc, /does \*\*not\*\* make the MCP server available to ordinary ChatGPT conversations/i);
});
