# Dispatch-card vehicle photos

Photo assets are organized under `public/images/dispatch-cards/` using lowercase kebab-case.

## Photo naming

Add real PNG files into a **vehicle-specific folder**, or into a **shared model folder** for Staria Limousine and Carnival Hi-Limousine:

- `exterior.png` — exterior card image
- `interior-01.png` — first interior image
- `interior-02.png` — second interior image

Additional images: `exterior-02.png`, `interior-03.png`, etc.
Recommended source dimensions: 1600 × 900 (16:9).

A `.gitkeep` is just a Git folder placeholder, **not** an image.

## Vehicle folder structure

| Folder | Vehicle plate suffixes | Photo policy |
| --- | --- | --- |
| `mercedes-benz/sprinter-319-cdi/9982/` | 9982 | vehicle-specific |
| `mercedes-benz/sprinter-519-cdi/{plate}/` | 8040, 1458, 2658, 3864, 3338, 2553, 3285, 1058 | vehicle-specific; interiors are not interchangeable |
| `mercedes-benz/s560/3343/` | 3343 | vehicle-specific |
| `hyundai/staria-limousine/` | **7665, 9037, 8407, 1514** | **one shared photo set for all four vehicles** |
| `kia/carnival-hi-limousine/` | **5336, 7681** | **one shared photo set for both vehicles** |
| `genesis/gv80/5947/` | 5947 | vehicle-specific |
| `genesis/g90-lwb/1336/` | 1336 | vehicle-specific |
| `genesis/g90-standard/8839/` | 8839 | vehicle-specific |
| `genesis/g90-limousine/4280/` | 4280 | vehicle-specific |
| `bus/limousine-bus/` | Not registered | placeholder only |

This covers **20 registered vehicles** with **14 vehicle-specific folders + 2 shared model folders**, plus the bus placeholder. The registered Carnival vehicles, **101호 7681** and **193호 5336**, are **both Carnival Hi-Limousine**.

## Shared model photos

**All four Staria vehicles** use exactly the same photos:

```text
public/images/dispatch-cards/hyundai/staria-limousine/
├── exterior.png
├── interior-01.png
└── interior-02.png
```

**Both Carnival Hi-Limousine vehicles** use exactly the same photos:

```text
public/images/dispatch-cards/kia/carnival-hi-limousine/
├── exterior.png
├── interior-01.png
└── interior-02.png
```

Do not add plate-number subfolders for Staria (`7665`, `9037`, `8407`, `1514`) or Carnival Hi-Limousine (`5336`, `7681`). Vehicle identities remain separate in the registry.

## Existing assets and migration safety

The currently running asset resolver is `lib/dispatchCards/dispatchCardAssets.ts`, which uses
`lib/dispatchCards/dispatchCardAssetManifest.json` and the *legacy* underscore path
`public/images/dispatch_cards/` with `.webp` assets. Its existing `staria` model-level key
already shares one image set for every Staria vehicle. The runtime resolver also identifies both Carnival vehicles as `carnival_high`, but the current manifest has **no Carnival photo set**.

This new kebab-case photo directory is an **upload-ready scaffold**, not an automatic runtime migration.
Do not point the manifest at missing images. Once real images are uploaded, update the manifest
and resolver with **one shared Staria model entry** and **one shared Carnival Hi-Limousine model entry**, preserving current fallbacks for missing files.

Example future Sprinter URL:
`/images/dispatch-cards/mercedes-benz/sprinter-519-cdi/1458/exterior.png`

Do not commit private driver portraits or sensitive documents here.
