# Dispatch-card vehicle photos

This is the **new** per-vehicle photo directory. File and folder names use lowercase kebab-case.

## Photo naming

Put the following three actual PNG images into each vehicle's folder:

- `exterior.png` — representative exterior image
- `interior-01.png` — first interior image
- `interior-02.png` — second interior image

For additional images use `exterior-02.png` or `interior-03.png`.
Recommended source dimensions: 1600 x 900 (16:9).
A `.gitkeep` file only preserves the empty folder in Git; it is **not** a photo.

## Vehicle folders

| Brand/model | Last four plate digits |
| --- | --- |
| mercedes-benz/sprinter-319-cdi | 8040 |
| mercedes-benz/sprinter-519-cdi | 9982, 1458, 2658, 3864, 3338, 2553, 3285, 1058 |
| mercedes-benz/s560 | 3343 |
| hyundai/staria-limousine | 7665, 9037, 8407, 1514 |
| kia/carnival-limousine | 7681 |
| kia/carnival-hi-limousine | 5336 |
| genesis/gv80 | 5947 |
| genesis/g90-lwb | 1336 |
| genesis/g90-standard | 8839 |
| genesis/g90-limousine | 4280 |
| bus/limousine-bus | Plate not yet in vehicle master; placeholder only |

The **20 registered vehicles** are based on `utils/vehicleData.ts` (branch checked 2026-11-20), except one vehicle-model distinction retained from the explicitly agreed folder layout:

> **Check before wiring:** `101호 7681` was previously categorized as a regular Carnival Limousine and its agreed folder is `carnival-limousine/7681`. The current `utils/vehicleData.ts` describes it as `카니발 하이리무진`. Confirm the physical model before changing the runtime vehicle data or assets mapping.

## Existing dispatch-card images: do not break them

Current working image assets are under **`public/images/dispatch_cards/`** (underscore), and `lib/dispatchCards/dispatchCardAssetManifest.json` uses those paths and `.webp` names.

This new **`public/images/dispatch-cards/`** (hyphen) hierarchy is an *upload-ready skeleton only*. Adding photos to these folders **does not automatically replace existing card images**. Once actual image files are uploaded, update the dispatch-card asset manifest to point to validated new paths, preserving its fallback for missing images. Do not replace existing manifest entries with missing files.

Example future public URL:
`/images/dispatch-cards/mercedes-benz/sprinter-519-cdi/1458/exterior.png`

No driver portrait photos or other private assets belong here.
