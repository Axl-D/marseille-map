# Marseille — 111 quartiers

Map of Marseille’s **16 arrondissements** and **111 quartiers**. No POIs. Overlay is IGN / INSEE Contours IRIS; basemap is OpenFreeMap Positron (proxied same-origin so Brave / Firefox don’t block the tiles).

**Live:** [marseille-map.vercel.app](https://marseille-map.vercel.app/)

Search arrondissement, quartier, or IRIS. Calques toggles fills, outlines, names, IRIS, and street labels.

## Run

Needs Node 26.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

```bash
npm test
npm run build
```

Rebuild boundaries (optional): `npm run fetch-boundaries` and `npm run fetch-iris`.

See [CHANGELOG.md](CHANGELOG.md).
