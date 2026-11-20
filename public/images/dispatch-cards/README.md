# Dispatch-card vehicle photos

Photo assets are organized under `public/images/dispatch-cards/` using lowercase kebab-case.

## Photo naming

Add real PNG files into each vehicle folder, or into the **shared model folder** for Staria Limousine:

- `exterior.png` — exterior card image
- `interior-01.png` — first interior image
- `interior-02.png` — second interior image

Additional images: `exterior-02.png`, `interior-03.png`, and so on.
Recommended dimensions: 1600 × 900 (16:9).

A `.gitkeep` is just a Git folder placeholder, **not** an image.

## Vehicle folder structure

| Folder | Vehicle plate suffixes | Photo policy |
| --- | --- | --- |
| `mercedes-benz/sprinter-319-cdi/8040/` | 8040 | vehicle-specific |
| `mercedes-benz/sprinter-519-cdi/{plate}/` | 9982, 1458, 2658, 3864, 3338, 2553, 3285, 1058 | vehicle-specific; interiors are not interchangeable |
| `mercedes-benz/s560/3343/` | 3343 | vehicle-specific |
| `hyundai/staria-limousine/` | **7665, 9037, 8407, 1514** | **one shared exterior/interior photo set for all four vehicles; NO plate-specific folders** |
| `kia/carnival-limousine/7681/` | 7681 | vehicle-specific |
| `kia/carnival-hi-limousine/5336/` | 5336 | vehicle-specific |
| `genesis/gv80/5947/` | 5947 | vehicle-specific |
| `genesis/g90-lwb/1336/` | 1336 | vehicle-specific |
| `genesis/g90-standard/8839/` | 8839 | vehicle-specific |
| `genesis/g90-limousine/4280/` | 4280 | vehicle-specific |
| `bus/limousine-bus/` | Not registered | placeholder only |

This covers **20 registered vehicles**, with **16 vehicle-specific folders + 1 shared Staria folder**, plus the bus placeholder.

## Staria Limousine: single common photo set

All four Staria vehicles must use exactly the same model-level photo paths:

```text
public/images/dispatch-cards/hyundai/staria-limousine/
├── exterior.png
├── interior-01.png
└── interior-02.png
```

**Do not create subfolders** `7665/`, `9037/`, `8407/`, or `1514/` here.
The vehicle numbers remain separate in the vehicle registry but should all refer to this one image set.

## Existing assets and migration safety

The currently running asset resolver is `lib/dispatchCards/dispatchCardAssets.ts`, which uses
`lib/dispatchCards/dispatchCardAssetManifest.json` and the *legacy* underscore path
`public/images/dispatch_cards/` with `.webp` assets. Its existing `staria` model-level key
already shares one image set for every Staria vehicle.

This new kebab-case photo directory is an **upload-ready scaffold**, not an automatic runtime migration.
Do not point the manifest at missing images. Once real files are uploaded, update the manifest and
resolver with a **single shared Staria model entry**, preserving the existing fallback behavior.

Example of a future Sprinter URL:
`/images/dispatch-cards/mercedes-benz/sprinter-519-cdi/1458/exterior.png`

### Vehicle-model consistency check

The current `utils/vehicleData.ts` records `101호 7681` as a *Carnival Hi-Limousine*,
but the previously agreed folder plan lists this plate as `carnival-limousine/7681`.
Confirm the physical vehicle type before binding its image path. This folder-only change
does not modify vehicle data.

Do not commit private driver portraits or sensitive documents here.
