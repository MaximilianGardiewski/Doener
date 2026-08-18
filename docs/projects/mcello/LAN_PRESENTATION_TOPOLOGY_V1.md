# Mcello LAN Presentation Topology V1

Status: **BINDING PRESENTATION PATH**

The presentation topology is intentionally local/private-LAN first. Vercel is not part of the Mcello presentation or production path.

## Roles

- **Laptop / Host**: runs Docker, local Supabase, the Mcello runtime and the LAN proxy. The host may open every view locally: customer, KDS, Ops and Admin.
- **Smartphone / Client**: customer-facing shop and Builder presentation. The Builder keeps the existing phone landscape contract; portrait shows the rotate gate without losing state.
- **Tablet / Staff**: KDS, Ops and Admin presentation surfaces. The tablet is the primary staff/admin device during a presentation.

## Network

The existing Windows 11 Mobile Hotspot/private-LAN launcher remains the transport. The Mcello app stays bound to loopback and the LAN proxy exposes only the dedicated presentation ingress to connected devices.

## Demo truth boundary

The presentation uses the existing disposable local Supabase stack and the presentation-only Pizza/Döner/Yufka fixtures. It must not use production data, managed production infrastructure or public-host fallbacks.

## Host convenience

Once the LAN presentation is ready, the laptop should make these views easy to open:

- Customer: `http://127.0.0.1:4173/?presentation=mcello&reset=1`
- KDS: `http://127.0.0.1:4173/kds.html`
- Ops: `http://127.0.0.1:4173/ops.html`
- Admin: `http://127.0.0.1:4173/admin.html`

The LAN launcher prints the equivalent private-LAN URLs for smartphone and tablet.

## Production boundary

The later production target remains VPS/dedicated infrastructure. Presentation scripts and local fixtures must not introduce a dependency on Vercel or another public presentation host.
