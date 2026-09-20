# Conformance pack

Generated. Do not edit by hand: run `npm run conformance:build` from the
repository root after any web change that alters serialized bytes, engine
results, field tables or registry defaults, and review the diff as a format
change (storage contract, law 6). `src/utils/conformancePack.test.ts` fails
until the pack matches the web code again; the Swift suites under
`apple/Tests` read these files by path.

| Path | Judges |
|---|---|
| `pack.json` | Manifest: frozen clock, id rule, file lists |
| `boards/<name>.json` + `.expected.json` | Parse, migrate, normalize, serialize, canonical checksums, split documents |
| `json/` | JavaScript number formatting and string escaping |
| `circuits/` | Wire transforms, golden propagation waves, time-sensitive sources |
| `fields/` | Port lists, getters, setters and commands per widget type. `date_picker`'s clock getters are frozen at `pack.json`'s `clockMs` but measured in the generating machine's local time zone (currently Asia/Tashkent, UTC+5); regenerate the pack if it is ever built elsewhere — the Swift tests read `TimeZone.current` |
| `registry.json` | Widget metadata, sizing, skins, default data, type catalog |
| `device.json` | Device-state resolution and tabs |
| `reconcile/` | Three-way merge cases (phase 6) |
| `packages/` | `.grovepad` archives and their expected entries |
| `treeShaper.json` | Tree shaper: icon packing, contours, accent dashes, committed layout, a shaping scenario through the web store and the records its commit writes |
