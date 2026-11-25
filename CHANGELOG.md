# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-25

### Fixed

- Basemap tiles are fetched via same-origin `/basemap` so Brave Shields and Firefox ETP no longer block `tiles.openfreemap.org`
- Min zoom is the zoom where `maxBounds` fills the viewport, so zoom-out cannot letterbox into empty tiles (hash `#10/…` is clamped)

## [0.1.0] - 2026-11-25

HUD restyle. Controls share one token set instead of MapLibre / geocoder defaults.

### Changed

- Search, Calques, zoom, quartier card, Données, and OSM attrib use `--hud-*` tokens (ink, paper, stroke, radius, type)
- Search focus keeps the card drop shadow; no 2px ink ring
- Empty-results row (`Aucun résultat trouvé`) uses the same 10×14 padding as hits
- Search loupe and clear (X) are 18×18, vertically centered in the 42px field
- Open Calques card drops below the search bar under 960px, instead of covering it
- OSM `(i)` matches Données: muted glyph, 1px card stroke, transparent fill, 29px row
- Attribution popup stacks above the quartier card; narrower on small screens

### Fixed

- Geocoder clear button was a 23×28 hit box (library `display:block` + 50px icon offsets on a 42px input)

## [0.0.0] - 2026-11-24

Initial public map.

### Added

- MapLibre overlay of Marseille’s 16 arrondissements and 111 quartiers (no POIs)
- Local search across arrondissement, quartier, and IRIS
- Calques toggles for fills, outlines, names, IRIS, and street labels
- Vercel deploy with Node 26.x

[0.1.1]: https://github.com/Axl-D/marseille-map/releases/tag/v0.1.1
[0.1.0]: https://github.com/Axl-D/marseille-map/releases/tag/v0.1.0
[0.0.0]: https://github.com/Axl-D/marseille-map/commit/2168a31
