# ChatGPT ↔ Gemini Notebook MCP — Setup, Betrieb, Test

Reproduzierbare Anleitung für die lokale Bridge und den OpenAI Secure MCP Tunnel.
Konzept und Sicherheitsmodell stehen zusätzlich in
[`integrations/CHATGPT_GEMINI_NOTEBOOK_BRIDGE.md`](integrations/CHATGPT_GEMINI_NOTEBOOK_BRIDGE.md).

**Wichtig:** Eine Registrierung in `%USERPROFILE%\.codex\config.toml` gilt für
Codex-Oberflächen. Sie macht den MCP **nicht** automatisch in normalen ChatGPT-
Chats verfügbar. Für ChatGPT ist der hier dokumentierte Tunnel-/Custom-App-Weg
maßgeblich.

## Architektur

```text
ChatGPT normaler Chat
        |
        | Custom MCP App
        v
OpenAI Secure MCP Tunnel
        |
        v
local tunnel client
        |
        | loopback
        v
127.0.0.1:8000/mcp   <- Allowlist-Proxy
        |
        v
127.0.0.1:8001/mcp   <- notebooklm-mcp upstream, nie direkt exponieren
        |
        v
Gemini Notebook
```

ChatGPT verbindet sich nicht direkt mit einem lokalen MCP-Server. Für einen
Server auf einem Entwicklerrechner oder in einem privaten Netz ist der Secure
MCP Tunnel der unterstützte Weg, ohne den Server öffentlich ins Internet zu
stellen.

## Eckdaten

| | |
|---|---|
| ChatGPT-seitige MCP-URL lokal | `http://127.0.0.1:8000/mcp` (Allowlist-Proxy) |
| Interner Upstream | `http://127.0.0.1:8001/mcp` (**nie** tunneln) |
| Health | `http://127.0.0.1:8000/health` |
| Transport | Streamable HTTP |
| Bind | ausschließlich `127.0.0.1` |
| Secret-Ablage | `.research-cache/chatgpt-tunnel/` (gitignored) |

## Sicherheitsgrenze

Die Upstream-Gating-Mechanik ist **keine** ausreichende Sicherheitsgrenze.
Versteckte Tools können upstream weiterhin per Namen aufrufbar sein. Deshalb
liegt vor `notebooklm-mcp` ein eigener Proxy:

```text
ChatGPT → Secure MCP Tunnel → :8000 Proxy → :8001 notebooklm-mcp
```

`scripts/mcp-allowlist-proxy.mjs` lehnt jeden `tools/call` außerhalb der
Allowlist ab und leitet ihn nicht weiter. Der Proxy filtert zusätzlich
`tools/list`.

### `readonly` (Default)

- `server_info`
- `notebook_list`
- `notebook_get`
- `notebook_describe`
- `source_describe`
- `source_get_content`

### `query`

Zusätzlich:

- `notebook_query`
- `notebook_query_start`
- `notebook_query_status`
- `chat_list`
- `chat_get`
- `chat_export`

`query` kann serverseitig Conversation-History erzeugen; deshalb bleibt
`readonly` der Default.

## Installation

```powershell
npm run research:chatgpt:setup
```

Der Setup-Pfad prüft die lokale NotebookLM/Gemini-Installation, Authentifizierung,
Allowlist-Tests und den Tunnel-Client. Secrets gehören nie ins Repo.

Falls nur die gemeinsame Gemini-Notebook-Basis fehlt:

```powershell
npm run setup:research
nlm login
```

## Bridge starten

Hintergrundbetrieb:

```powershell
npm run research:chatgpt:bg
```

Vordergrundbetrieb:

```powershell
npm run research:chatgpt
```

Stoppen:

```powershell
npm run research:chatgpt:stop
```

## Lokalen MCP prüfen

```powershell
npm run research:chatgpt:check
```

Der Check validiert unter anderem:

- `/health`
- MCP `initialize`
- `tools/list`
- exakt die erlaubte Toolmenge
- keine mutierenden Tools
- ein verstecktes Read-only-Tool kann **nicht** per Namen aufgerufen werden

Ein erfolgreicher Lauf endet mit:

```text
All 7 checks passed. Bridge is safe to expose through the tunnel.
```

Zusätzlich sollte der direkte Gemini-Zugriff funktionieren:

```powershell
nlm notebook list
```

## Secure MCP Tunnel starten

```powershell
npm run research:chatgpt:tunnel
```

Query-Profil:

```powershell
npm run research:chatgpt:tunnel -- -Mode query
```

Stoppen:

```powershell
npm run research:chatgpt:tunnel:stop
```

Diagnose:

```powershell
npm run research:chatgpt:tunnel:doctor
```

Der Tunnel darf ausschließlich auf den Proxy `127.0.0.1:8000/mcp` zeigen,
niemals auf den Upstream-Port `8001`.

## ChatGPT Custom App

In ChatGPT Developer Mode / Custom Apps:

1. Custom App für `Gemini Notebook` anlegen.
2. Secure MCP Tunnel als Verbindung wählen.
3. Den zugehörigen Tunnel auswählen.
4. Tools scannen.
5. Prüfen, dass nur die Tools des gewählten Profils erscheinen.
6. App zunächst privat halten.
7. Mit `notebook_list` testen.
8. Erst danach optional `query` aktivieren.

Wenn Delete-/Share-/Studio-/Source-Write-/Research-Import-Tools auftauchen:
**nicht freigeben**, Bridge stoppen und Proxy/Upstream-Version prüfen.

## ChatGPT ist nicht Codex

Diese beiden Wege sind bewusst getrennt:

| Client | Lokaler `127.0.0.1` MCP direkt | Richtiger Weg |
|---|---:|---|
| Codex CLI / Codex Desktop / IDE | ja | `~/.codex/config.toml` |
| normaler ChatGPT-Chat | nein | Custom App + Secure MCP Tunnel |

Die Codex-Integration ist separat dokumentiert:
[`integrations/CODEX_GEMINI_NOTEBOOK_BRIDGE.md`](integrations/CODEX_GEMINI_NOTEBOOK_BRIDGE.md).

Codex registrieren:

```powershell
npm run research:codex:register
```

Entfernen:

```powershell
npm run research:codex:remove
```

Diese Befehle sind **kein** ChatGPT-Setup und werden deshalb nicht mehr unter
`research:chatgpt:desktop*` geführt.

## Plan-/Workspace-Grenzen

Die Verfügbarkeit von Custom MCP Apps und Secure MCP Tunnel hängt vom aktuellen
OpenAI-Plan/Workspace und dessen Einstellungen ab. Der lokale Repo-Teil kann
vollständig funktionieren, auch wenn die ChatGPT-Oberfläche die App im aktuellen
Workspace noch nicht freigibt.

## Troubleshooting

| Symptom | Ursache / Abhilfe |
|---|---|
| `nlm notebook list` → Auth expired | `nlm login` |
| `EADDRINUSE 127.0.0.1:8000` | Bridge läuft bereits; nicht doppelt starten |
| `tools/list` zeigt mehr als Allowlist | **Nicht tunneln**; Proxy/Version prüfen |
| Hidden-tool-Probe schlägt fehl | Tunnel/Client zeigt evtl. auf `8001` statt `8000` |
| ChatGPT sagt `gemini_notebook` nicht verfügbar | Custom App/Tunnel ist im ChatGPT-Workspace nicht verbunden; `.codex/config.toml` hilft normalen ChatGPT-Chats nicht |
| Codex sieht `gemini_notebook` nicht | `npm run research:codex:register`, Codex neu starten |
| Gemini Auth ist gültig, ChatGPT sieht trotzdem nichts | ChatGPT-App-/Workspace-Konfiguration prüfen, nicht den lokalen MCP neu bauen |

## Verifikationsstand

Lokal bereits nachgewiesen:

- Gemini-Authentifizierung gültig
- `nlm notebook list` liefert echte Notebooks
- Upstream auf `8001`
- Allowlist-Proxy auf `8000`
- MCP `initialize` erfolgreich
- exakt sechs `readonly`-Tools
- mutierende Tools nicht exponiert
- verstecktes `source_list_drive` wird aktiv blockiert

Noch separat zu verifizieren ist immer die letzte ChatGPT-Schicht:
Custom App → Secure MCP Tunnel → lokaler Proxy.
