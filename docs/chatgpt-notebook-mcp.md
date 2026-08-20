# ChatGPT ↔ Gemini Notebook MCP — Setup, Betrieb, Test

Reproduzierbare Anleitung für die lokale Bridge und den OpenAI Secure MCP Tunnel.
Konzept, Sicherheitsmodell und Tool-Profile stehen in
[`integrations/CHATGPT_GEMINI_NOTEBOOK_BRIDGE.md`](integrations/CHATGPT_GEMINI_NOTEBOOK_BRIDGE.md).

**Keine Secrets in dieses Dokument, ins Repo, in `package.json` oder in Logs.**

## Architektur

```text
ChatGPT  ──►  OpenAI Secure MCP Tunnel  ──►  tunnel-client (lokal)
                                                   │  Loopback
                                                   ▼
                                    notebooklm-mcp  127.0.0.1:8000/mcp
                                                   │
                                                   ▼
                                            Gemini Notebook
```

Es sind **zwei** lokale Prozesse. Beide müssen laufen — `tunnel-client` wird für
Discovery *und* für jeden Tool-Call gebraucht, nicht nur beim Verbinden.

## Eckdaten

| | |
|---|---|
| Lokale MCP-URL | `http://127.0.0.1:8000/mcp` |
| Health | `http://127.0.0.1:8000/health` |
| Transport | Streamable HTTP (`--transport http`) |
| Bind | ausschließlich `127.0.0.1` |
| Upstream | `notebooklm-mcp-cli==0.9.13` (via `uv tool`) |
| Tunnel-Diagnose | `http://127.0.0.1:8080/ui`, `/healthz`, `/readyz`, `/metrics` |
| Secret-Ablage | `.research-cache/chatgpt-tunnel/` (gitignored, DPAPI-verschlüsselt) |

Port und Pfad sind über `-Port` änderbar; die Werte oben sind die Defaults.

## Tool-Allowlist

Fail-closed: erst werden **alle 14** Upstream-Gruppen (43 Tools) über
`NOTEBOOKLM_DISABLED_GROUPS` deaktiviert, danach reaktiviert
`NOTEBOOKLM_ENABLED_TOOLS` genau die erlaubten. Ein neues Tool in einer
bestehenden Gruppe erreicht ChatGPT dadurch nicht automatisch.

**`readonly` (Default)** — `server_info`, `notebook_list`, `notebook_get`,
`notebook_describe`, `source_describe`, `source_get_content`

**`query`** — zusätzlich `notebook_query`, `notebook_query_start`,
`notebook_query_status`, `chat_list`, `chat_get`, `chat_export`

> `notebook_query*` verändert keine Notebooks oder Sources, erzeugt aber
> serverseitig persistente Conversation-History. Deshalb ist `readonly` der
> Default und `query` eine bewusste Entscheidung.

## Environment-Variablen

Keine davon gehört ins Repo. Die Scripts setzen sie zur Laufzeit.

| Variable | Zweck |
|---|---|
| `CONTROL_PLANE_TUNNEL_ID` | Tunnel-ID, Format `tunnel_` + 32 Hex |
| `CONTROL_PLANE_API_KEY` | Runtime-API-Key (**kein** Admin-Key) |
| `MCP_SERVER_URL` | `http://127.0.0.1:8000/mcp` |
| `HEALTH_LISTEN_ADDR` | optional, Default `127.0.0.1:8080` |
| `NOTEBOOKLM_ALLOW_EXTERNAL_BIND` | **niemals setzen** |

## Installation

```powershell
npm run research:chatgpt:setup
```

Idempotent — mehrfaches Ausführen ist unschädlich. Prüft Node/npm,
Dependencies, `notebooklm-mcp-cli`, Gemini-Notebook-Login, `.gitignore`,
`tunnel-client`, Tunnel-Konfiguration, die Allowlist-Tests, startet die Bridge
und verifiziert Health, MCP-Handshake und `tools/list`.

`tunnel-client` wird **nicht automatisch** installiert. Zwei unterstützte Wege:

1. Download-Button auf <https://platform.openai.com/settings/organization/tunnels>
2. `npm run research:chatgpt:setup -- -InstallTunnelClient`

> Zu (2): OpenAI veröffentlicht **kein Checksums-File** zu den Release-Archiven.
> Der Download lässt sich deshalb nicht gegen eine Herstellerangabe verifizieren.
> Das Script schreibt den SHA256 des geladenen Artefakts mit, sodass ein
> späterer Austausch auffällt. Wer das nicht will, nimmt Weg (1).

## Konfiguration

Beim ersten Start werden Tunnel-ID und Runtime-API-Key abgefragt. Der Key wird
mit `Read-Host -AsSecureString` eingelesen, per `ConvertFrom-SecureString`
(DPAPI, an Benutzer *und* Rechner gebunden) gespeichert und dem Kindprozess nur
über dessen Environment übergeben — nie als Prozessargument, nie im Klartext auf
Platte, nie im Log.

Ändern: `npm run research:chatgpt:tunnel -- -Reconfigure`

## Start

```powershell
npm run research:chatgpt:tunnel          # Bridge + Tunnel, readonly
npm run research:chatgpt:tunnel -- -Mode query
npm run research:chatgpt                 # nur Bridge, Vordergrund
npm run research:chatgpt:bg              # nur Bridge, Hintergrund
```

Der Tunnel startet **nur**, wenn die Bridge ihre eigenen Checks besteht. Eine
fehlgeschlagene Allowlist-Prüfung verhindert das Exponieren.

## Stop

```powershell
npm run research:chatgpt:tunnel:stop     # beide Prozesse
npm run research:chatgpt:stop            # nur die Bridge
```

Beide Prozesse haben PID-Dateien unter `.research-cache/`.

## Test

```powershell
npm run research:chatgpt:check           # Health, initialize, tools/list, Allowlist
npm run research:chatgpt:tunnel:doctor   # tunnel-client doctor
npm run test:schema                      # statische Allowlist-Guards
```

`research:chatgpt:check` prüft fünf Dinge gegen den **laufenden** Server: Health,
MCP-`initialize`, `tools/list`, dass kein Tool über die Allowlist hinausgeht und
kein Toolname ein mutierendes Verb enthält. Zusätzlich ruft es ein verstecktes,
read-only Tool (`source_list_drive`) auf und erwartet eine Ablehnung — der
Upstream-Docstring sagt *„no tool is unregistered, only hidden"*, was ohne diese
Probe ungeprüft bliebe.

## Tunnel

Diagnose bei laufendem Tunnel:

```text
http://127.0.0.1:8080/ui        Status-Oberfläche
http://127.0.0.1:8080/readyz    muss 200 liefern
http://127.0.0.1:8080/healthz
http://127.0.0.1:8080/metrics
```

Der MCP muss als Channel **`main`** verfügbar sein; `MCP_SERVER_URL` liefert
genau das.

## ChatGPT Plugin

Manuell im Browser:

1. <https://chatgpt.com/#settings/Connectors> öffnen
2. Custom App / Connector anlegen
   - Name: `Gemini Notebook`
   - Beschreibung: `Lokaler MCP für NotebookLM / Gemini Notebook`
3. **Connection: Tunnel** wählen, den Tunnel auswählen
4. Tools scannen
5. Prüfen, dass **nur** die Tools des gewählten Profils erscheinen
6. App privat halten
7. Mit `notebook_list` testen, bevor `query` aktiviert wird

Erscheint der Tunnel nicht in der Liste, ist er meist im falschen
Workspace-Scope angelegt.

Eine zusätzliche OAuth-Schicht auf der Bridge ist **nicht** nötig: der Tunnel
liefert die authentifizierte Transportverbindung, und der lokale Endpoint lauscht
ausschließlich auf Loopback. Ein direkt erreichbarer Endpoint bräuchte
Authentifizierung — deshalb darf `NOTEBOOKLM_ALLOW_EXTERNAL_BIND` nie gesetzt
werden.

## Troubleshooting

| Symptom | Ursache / Abhilfe |
|---|---|
| `Required command 'nlm' is missing` | `npm run setup:research`, danach neue Shell |
| `not authenticated` | `nlm login` |
| Health antwortet nicht | Port belegt? `-Port` ändern; `.research-cache/chatgpt-mcp/server.err.log` |
| `tools/list` zeigt unerwartete Tools | **Nicht freigeben.** Upstream-Version geprüft? Gruppen-Map gegen `tests/chatgpt-notebook-mcp-allowlist.test.mjs` diffen |
| `hidden tools cannot be invoked` schlägt fehl | Die Allowlist versteckt nur, blockt nicht. Bridge nicht exponieren, Upstream-Issue eröffnen |
| `uv tool install` schlägt fehl | Version muss auf PyPI existieren — 0.9.5 und 0.9.7 gibt es dort **nicht** |
| Tunnel `readyz` nie 200 | `.research-cache/chatgpt-tunnel/tunnel.err.log`; Tunnel-ID und Runtime-Key prüfen |
| Tunnel fehlt in ChatGPT | falscher Workspace-Scope beim Anlegen |
| Nach Gemini-Notebook-Änderung bricht alles | fail closed lassen, `npm run doctor:research`, Upgrade bewusst durchführen |

## Bekannte Grenzen

- **Nicht auf Windows verifiziert.** Die PowerShell-Scripts wurden in einer
  Linux-Umgebung ohne `pwsh` geschrieben; ihre Sicherheitseigenschaften sind
  statisch getestet, ihre Ausführung nicht.
- **Plan-Stufen des Secure MCP Tunnel nicht verifiziert.** Ob Business /
  Enterprise / Edu / Pro nötig ist, konnte nicht aus offizieller Quelle bestätigt
  werden: <https://developers.openai.com/api/docs/guides/secure-mcp-tunnels>
- `notebooklm-mcp-cli` nutzt **undokumentierte** Google-Endpunkte. Es gibt keine
  offizielle NotebookLM-Consumer-API. Brüche kommen von RPC-/Host-Wechseln.
- Ein Tippfehler in einem Gruppennamen sperrt upstream **still gar nichts**
  (`TOOL_GROUPS.get(group, set())`). Deshalb prüft der Test auf exakte
  Mengengleichheit.
