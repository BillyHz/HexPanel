#!/usr/bin/env python3
"""Generate item icons and a catalog from a Minecraft client jar (PLAN.md §7.6).

Mojang's assets are NOT redistributed: this script renders them locally from the
client jar of the same version the server runs (1.21.11).

Output (default ``frontend/public/assets/items/``, git-ignored):
  * ``<item_id>.png``  32x32 icons
      - flat items (``item/generated``, ``item/handheld``): layers composed at 16x16
        and scaled x2 with nearest neighbour;
      - block-like models: isometric render (top 100% / left 80% / right 60% shading);
        non-cubic models (stairs, slabs...) are approximated with their bounding box;
      - animated textures: first frame only.
  * ``items.json``     ``[{id, name, maxStack, category}]`` (names from ``es_es``).

Usage::

    python tools/extract_assets.py [client.jar] [--out DIR] [--mc-version 1.21.11]

If no jar is given, it is searched in ``$HEX_CLIENT_JAR`` and in the sibling
HexLauncher data dirs. ``es_es.json`` is not inside the client jar (it lives in the
launcher's asset index); it is looked up in ``<.minecraft>/assets`` next to the
``versions`` dir, or passed with ``--lang-file``. ``en_us`` from the jar is the fallback.

Requires Pillow.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image

ICON_SIZE = 32
SHADE_TOP, SHADE_LEFT, SHADE_RIGHT = 1.0, 0.8, 0.6

GRASS_COLOR = 0x91BD59
FOLIAGE_COLOR = 0x77AB2F

# Faces shown in the GUI isometric view: (top, left, right)
ISO_FACES = ("up", "north", "west")


# --------------------------------------------------------------------------- jar access
class Jar:
    """Thin read-only wrapper over the client jar."""

    def __init__(self, path: Path):
        self.zf = zipfile.ZipFile(path)
        self.names = set(self.zf.namelist())

    def has(self, name: str) -> bool:
        return name in self.names

    def read(self, name: str) -> bytes:
        return self.zf.read(name)

    def json(self, name: str) -> Any:
        return json.loads(self.read(name).decode("utf-8"))

    def item_ids(self) -> list[str]:
        prefix = "assets/minecraft/items/"
        return sorted(
            n[len(prefix) : -5]
            for n in self.names
            if n.startswith(prefix) and n.endswith(".json") and "/" not in n[len(prefix) :]
        )


def strip_ns(ref: str) -> str:
    return ref.split(":", 1)[1] if ":" in ref else ref


# --------------------------------------------------------------------------- models
class ModelResolver:
    def __init__(self, jar: Jar):
        self.jar = jar
        self._cache: dict[str, dict[str, Any]] = {}

    def resolve(self, ref: str, depth: int = 0) -> dict[str, Any] | None:
        """Return ``{textures, elements, builtin}`` with the parent chain merged."""
        ref = strip_ns(ref)
        if ref in self._cache:
            return self._cache[ref]
        if ref.startswith("builtin/"):
            return {"textures": {}, "elements": None, "builtin": ref[len("builtin/") :]}
        name = f"assets/minecraft/models/{ref}.json"
        if depth > 20 or not self.jar.has(name):
            return None
        data = self.jar.json(name)
        merged: dict[str, Any] = {"textures": {}, "elements": None, "builtin": None}
        if "parent" in data:
            parent = self.resolve(data["parent"], depth + 1)
            if parent is None:
                return None
            merged = {
                "textures": dict(parent["textures"]),
                "elements": parent["elements"],
                "builtin": parent["builtin"],
            }
        merged["textures"].update(data.get("textures", {}))
        if "elements" in data:
            merged["elements"] = data["elements"]
        self._cache[ref] = merged
        return merged


def resolve_texture(textures: dict[str, str], value: str | None) -> str | None:
    for _ in range(20):
        if value is None or not value.startswith("#"):
            return value
        value = textures.get(value[1:])
    return None


def pick_model(node: dict[str, Any] | None) -> tuple[str, list[Any]] | None:
    """Walk a 1.21.4+ item definition tree to a representative (model, tints)."""
    if not node:
        return None
    kind = strip_ns(node.get("type", "model"))
    if kind == "model":
        return node["model"], node.get("tints", [])
    if kind == "condition":
        return pick_model(node.get("on_false") or node.get("on_true"))
    if kind in ("select", "range_dispatch"):
        if "fallback" in node:
            return pick_model(node["fallback"])
        entries = node.get("cases") or node.get("entries") or []
        return pick_model(entries[0]["model"]) if entries else None
    if kind == "composite":
        models = node.get("models") or []
        return pick_model(models[0]) if models else None
    if kind == "special":
        base = node.get("base")
        return (base, []) if base else None
    return None  # "empty", unknown


# --------------------------------------------------------------------------- textures
def tint_color(tint: Any) -> tuple[int, int, int] | None:
    if not isinstance(tint, dict):
        return None
    kind = strip_ns(tint.get("type", ""))
    value: Any
    if kind == "constant":
        value = tint.get("value")
    elif kind == "grass":
        value = GRASS_COLOR
    elif kind == "foliage":
        value = FOLIAGE_COLOR
    else:
        value = tint.get("default")
    if isinstance(value, list) and len(value) >= 3:
        return tuple(max(0, min(255, round(float(c) * 255))) for c in value[:3])  # type: ignore[return-value]
    if isinstance(value, int):
        v = value & 0xFFFFFF
        return (v >> 16) & 255, (v >> 8) & 255, v & 255
    return None


def apply_tint(img: Image.Image, color: tuple[int, int, int] | None) -> Image.Image:
    if color is None:
        return img
    r, g, b, a = img.split()
    r = r.point(lambda p: p * color[0] // 255)
    g = g.point(lambda p: p * color[1] // 255)
    b = b.point(lambda p: p * color[2] // 255)
    return Image.merge("RGBA", (r, g, b, a))


class TextureLoader:
    def __init__(self, jar: Jar):
        self.jar = jar
        self._cache: dict[str, Image.Image | None] = {}

    def load(self, ref: str | None) -> Image.Image | None:
        """Load a texture; animated strips yield the first frame."""
        if ref is None:
            return None
        ref = strip_ns(ref)
        if ref not in self._cache:
            name = f"assets/minecraft/textures/{ref}.png"
            img = None
            if self.jar.has(name):
                img = Image.open(io.BytesIO(self.jar.read(name))).convert("RGBA")
                w, h = img.size
                if h > w and h % w == 0:
                    img = img.crop((0, 0, w, w))
            self._cache[ref] = img
        img = self._cache[ref]
        return img.copy() if img else None


# --------------------------------------------------------------------------- rendering
def render_flat(
    textures: dict[str, str], loader: TextureLoader, tints: list[Any]
) -> Image.Image | None:
    result: Image.Image | None = None
    i = 0
    while f"layer{i}" in textures:
        layer = loader.load(resolve_texture(textures, textures[f"layer{i}"]))
        if layer is None:
            return None
        if i < len(tints):
            layer = apply_tint(layer, tint_color(tints[i]))
        if result is None:
            result = layer
        else:
            if layer.size != result.size:
                layer = layer.resize(result.size, Image.NEAREST)
            result = Image.alpha_composite(result, layer)
        i += 1
    if result is None:
        return None
    return result.resize((ICON_SIZE, ICON_SIZE), Image.NEAREST)


def _warp(face: Image.Image, origin: tuple[float, float], u: tuple[float, float],
          v: tuple[float, float]) -> Image.Image:
    """Map ``face`` onto the parallelogram origin + s*u + t*v (s,t in [0,1])."""
    w, h = face.size
    det = u[0] * v[1] - v[0] * u[1]
    a, b = v[1] * w / det, -v[0] * w / det
    c = w * (v[0] * origin[1] - v[1] * origin[0]) / det
    d, e = -u[1] * h / det, u[0] * h / det
    f = h * (u[1] * origin[0] - u[0] * origin[1]) / det
    return face.transform((ICON_SIZE, ICON_SIZE), Image.AFFINE, (a, b, c, d, e, f), Image.NEAREST)


def _shade(img: Image.Image, factor: float) -> Image.Image:
    if factor >= 1.0:
        return img
    r, g, b, a = img.split()
    scale = lambda p: int(p * factor)  # noqa: E731
    return Image.merge("RGBA", (r.point(scale), g.point(scale), b.point(scale), a))


def render_iso(
    layers: dict[str, list[tuple[Image.Image, tuple[float, float, float, float], Any]]],
    y_range: tuple[float, float],
) -> Image.Image:
    """layers[face] = [(texture, uv, tint_color), ...] drawn in order."""
    y0, y1 = y_range
    height = max(1.0, y1 - y0)
    shift = 16.0 - y1
    geometry = {
        "top": ((0.0, 8.0 + shift), (16.0, -8.0), (16.0, 8.0), SHADE_TOP, 16),
        "left": ((0.0, 8.0 + shift), (16.0, 8.0), (0.0, height), SHADE_LEFT, round(height)),
        "right": ((16.0, 16.0 + shift), (16.0, -8.0), (0.0, height), SHADE_RIGHT, round(height)),
    }
    canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    for key, face_name in zip(("top", "left", "right"), ISO_FACES):
        origin, u, v, shade, target_h = geometry[key]
        composed: Image.Image | None = None
        for tex, uv, color in layers.get(face_name, []):
            tw, th = tex.size
            sx, sy = tw / 16.0, th / 16.0
            box = (round(uv[0] * sx), round(uv[1] * sy), round(uv[2] * sx), round(uv[3] * sy))
            lo_x, hi_x = sorted((box[0], box[2]))
            lo_y, hi_y = sorted((box[1], box[3]))
            if hi_x <= lo_x or hi_y <= lo_y:
                continue
            part = tex.crop((lo_x, lo_y, hi_x, hi_y)).resize((16, max(1, target_h)), Image.NEAREST)
            part = apply_tint(part, color)
            composed = part if composed is None else Image.alpha_composite(composed, part)
        if composed is None:
            continue
        canvas = Image.alpha_composite(canvas, _shade(_warp(composed, origin, u, v), shade))
    return canvas


def render_model(
    model: dict[str, Any], loader: TextureLoader, tints: list[Any]
) -> Image.Image | None:
    textures: dict[str, str] = model["textures"]
    elements = model["elements"]

    if model["builtin"] == "generated" or (not elements and "layer0" in textures):
        return render_flat(textures, loader, tints)

    if not elements:
        # builtin/entity (chests, beds, banners...): approximate with a particle cube.
        tex = loader.load(resolve_texture(textures, textures.get("particle")))
        if tex is None:
            return None
        full = [(tex, (0.0, 0.0, 16.0, 16.0), None)]
        return render_iso({f: full for f in ISO_FACES}, (0.0, 16.0))

    # Union bounding box of the elements.
    min_x = min(e["from"][0] for e in elements)
    max_x = max(e["to"][0] for e in elements)
    min_z = min(e["from"][2] for e in elements)
    max_z = max(e["to"][2] for e in elements)
    if max_x - min_x < 15.9 or max_z - min_z < 15.9:
        # Thin / partial footprint (fences, panes, torches...): flat texture fallback.
        for key in ("layer0", "all", "texture", "side", "front", "particle"):
            if key in textures:
                tex = loader.load(resolve_texture(textures, textures[key]))
                if tex is not None:
                    return tex.resize((ICON_SIZE, ICON_SIZE), Image.NEAREST)
        return None

    layers: dict[str, list[Any]] = {f: [] for f in ISO_FACES}
    y_lo, y_hi = 16.0, 0.0
    for el in elements:
        if el["to"][0] - el["from"][0] < 15.9 or el["to"][2] - el["from"][2] < 15.9:
            continue  # partial parts (e.g. stair upper step) are ignored
        y_lo, y_hi = min(y_lo, el["from"][1]), max(y_hi, el["to"][1])
        for face_name in ISO_FACES:
            face = el.get("faces", {}).get(face_name)
            if not face:
                continue
            tex = loader.load(resolve_texture(textures, face.get("texture")))
            if tex is None:
                continue
            color = None
            if "tintindex" in face:
                idx = face["tintindex"]
                color = tint_color(tints[idx]) if 0 <= idx < len(tints) else None
            layers[face_name].append((tex, tuple(face.get("uv", (0, 0, 16, 16))), color))
    if y_hi <= y_lo or not any(layers.values()):
        return None
    return render_iso(layers, (y_lo, y_hi))


# --------------------------------------------------------------------------- catalog
ARMOR = ("_helmet", "_chestplate", "_leggings", "_boots", "_horse_armor", "_nautilus_armor")
TOOLS = ("_pickaxe", "_axe", "_shovel", "_hoe")
COMBAT = ("_sword", "_spear")
COMBAT_EXACT = {"bow", "crossbow", "trident", "mace", "shield", "arrow", "spectral_arrow",
                "tipped_arrow", "wind_charge", "fire_charge"}
TOOL_EXACT = {"shears", "flint_and_steel", "fishing_rod", "carrot_on_a_stick", "brush",
              "warped_fungus_on_a_stick", "spyglass", "compass", "clock", "lead", "name_tag"}
FOOD = {
    "apple", "golden_apple", "enchanted_golden_apple", "bread", "cooked_beef", "beef",
    "cooked_porkchop", "porkchop", "cooked_chicken", "chicken", "cooked_mutton", "mutton",
    "cooked_rabbit", "rabbit", "cooked_cod", "cod", "cooked_salmon", "salmon", "tropical_fish",
    "pufferfish", "carrot", "golden_carrot", "potato", "baked_potato", "poisonous_potato",
    "beetroot", "beetroot_soup", "mushroom_stew", "rabbit_stew", "suspicious_stew", "melon_slice",
    "sweet_berries", "glow_berries", "cookie", "pumpkin_pie", "cake", "dried_kelp",
    "rotten_flesh", "spider_eye", "chorus_fruit", "honey_bottle", "milk_bucket", "egg",
}
REDSTONE = {
    "redstone", "repeater", "comparator", "observer", "piston", "sticky_piston", "hopper",
    "dropper", "dispenser", "redstone_torch", "redstone_lamp", "lever", "tripwire_hook",
    "target", "daylight_detector", "tnt", "slime_block", "honey_block", "lightning_rod",
    "note_block", "crafter", "rail", "powered_rail", "detector_rail", "activator_rail",
}
BREWING = {"potion", "splash_potion", "lingering_potion", "glass_bottle", "brewing_stand",
           "blaze_powder", "fermented_spider_eye", "ghast_tear", "dragon_breath"}


def categorize(item_id: str, model_ref: str | None) -> str:
    if item_id.endswith(ARMOR) or item_id in ("elytra", "turtle_helmet", "carved_pumpkin"):
        return "armor"
    if item_id.endswith(COMBAT) or item_id in COMBAT_EXACT:
        return "combat"
    if item_id.endswith(TOOLS) or item_id in TOOL_EXACT:
        return "tools"
    if item_id in FOOD:
        return "food"
    if item_id in REDSTONE or item_id.endswith(("_pressure_plate", "_button", "_door", "_trapdoor", "_fence_gate")):
        return "redstone"
    if item_id in BREWING:
        return "brewing"
    if model_ref and strip_ns(model_ref).startswith("block/"):
        return "blocks"
    return "misc"


def max_stack(item_id: str) -> int:
    """Heuristic; the Bridge reports the authoritative value per live ItemStack."""
    if item_id.endswith(ARMOR) or item_id.endswith(TOOLS) or item_id.endswith(COMBAT):
        return 1
    if item_id.endswith(("_shulker_box", "_boat", "_raft", "_minecart", "_chest_boat")) or item_id == "shulker_box":
        return 1
    if item_id.startswith("music_disc_") or item_id in {
        "bow", "crossbow", "trident", "mace", "shield", "elytra", "shears", "flint_and_steel",
        "fishing_rod", "carrot_on_a_stick", "warped_fungus_on_a_stick", "brush", "totem_of_undying",
        "saddle", "minecart", "potion", "splash_potion", "lingering_potion", "enchanted_book",
        "writable_book", "cake", "mushroom_stew", "rabbit_stew", "beetroot_soup", "suspicious_stew",
        "water_bucket", "lava_bucket", "milk_bucket", "powder_snow_bucket", "axolotl_bucket",
        "cod_bucket", "salmon_bucket", "pufferfish_bucket", "tropical_fish_bucket", "tadpole_bucket",
        "turtle_helmet", "bundle", "knowledge_book", "debug_stick", "filled_map",
    }:
        return 1
    if item_id.endswith(("_sign", "_hanging_sign", "_bed", "_banner")) or item_id in {
        "bucket", "snowball", "egg", "ender_pearl", "honey_bottle", "armor_stand", "written_book",
        "white_banner", "painting", "item_frame", "glow_item_frame", "minecart_with_chest",
        "firework_star", "oak_boat",
    } or item_id.endswith("_spawn_egg"):
        return 16
    return 64


def title_case(item_id: str) -> str:
    return item_id.replace("_", " ").title()


def load_lang(jar: Jar, lang_file: Path | None, jar_path: Path) -> dict[str, str]:
    """Spanish names if found; otherwise en_us from the jar."""
    candidates: list[Path] = []
    if lang_file:
        candidates.append(lang_file)
    else:
        found = _find_es_es(jar_path)
        if found:
            candidates.append(found)
    for cand in candidates:
        if cand.is_file():
            return json.loads(cand.read_text(encoding="utf-8"))
    print("warning: es_es.json not found, falling back to en_us names", file=sys.stderr)
    name = "assets/minecraft/lang/en_us.json"
    return jar.json(name) if jar.has(name) else {}


def _find_es_es(jar_path: Path) -> Path | None:
    """Resolve es_es.json through the launcher asset index next to the jar."""
    version_json = jar_path.with_suffix(".json")
    assets = jar_path.parent.parent.parent / "assets"
    if not version_json.is_file() or not assets.is_dir():
        return None
    try:
        index_id = json.loads(version_json.read_text(encoding="utf-8"))["assetIndex"]["id"]
        index = json.loads((assets / "indexes" / f"{index_id}.json").read_text(encoding="utf-8"))
        digest = index["objects"]["minecraft/lang/es_es.json"]["hash"]
    except (KeyError, OSError, ValueError):
        return None
    path = assets / "objects" / digest[:2] / digest
    return path if path.is_file() else None


# --------------------------------------------------------------------------- driver
def extract(jar_path: Path, out_dir: Path, lang_file: Path | None = None) -> dict[str, Any]:
    jar = Jar(jar_path)
    models = ModelResolver(jar)
    loader = TextureLoader(jar)
    lang = load_lang(jar, lang_file, jar_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    catalog: list[dict[str, Any]] = []
    skipped: list[str] = []
    for item_id in jar.item_ids():
        definition = jar.json(f"assets/minecraft/items/{item_id}.json")
        picked = pick_model(definition.get("model"))
        icon = None
        if picked:
            model = models.resolve(picked[0])
            if model:
                icon = render_model(model, loader, picked[1])
        if icon is None:
            skipped.append(item_id)
            continue
        icon.save(out_dir / f"{item_id}.png", optimize=True)
        name = (lang.get(f"item.minecraft.{item_id}") or lang.get(f"block.minecraft.{item_id}")
                or title_case(item_id))
        catalog.append({
            "id": item_id,
            "name": name,
            "maxStack": max_stack(item_id),
            "category": categorize(item_id, picked[0] if picked else None),
        })

    (out_dir / "items.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return {"rendered": len(catalog), "skipped": skipped}


def find_client_jar(version: str) -> Path | None:
    env = os.environ.get("HEX_CLIENT_JAR")
    if env and Path(env).is_file():
        return Path(env)
    root = Path(__file__).resolve().parents[2]  # .../HexLauncher
    for found in sorted(root.glob(f"**/versions/{version}/{version}.jar")):
        if "server" not in found.parts[-5:] and "HexServer" not in found.parts:
            return found
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("jar", nargs="?", type=Path, help="Minecraft client jar")
    parser.add_argument("--out", type=Path,
                        default=Path(__file__).resolve().parents[1] / "frontend/public/assets/items")
    parser.add_argument("--mc-version", default="1.21.11")
    parser.add_argument("--lang-file", type=Path, help="es_es.json (overrides auto-detection)")
    args = parser.parse_args(argv)

    jar = args.jar or find_client_jar(args.mc_version)
    if not jar or not jar.is_file():
        print("error: client jar not found; pass its path or set HEX_CLIENT_JAR", file=sys.stderr)
        return 2
    print(f"jar: {jar}")
    result = extract(jar, args.out, args.lang_file)
    print(f"rendered {result['rendered']} icons -> {args.out}")
    if result["skipped"]:
        print(f"skipped {len(result['skipped'])} (no renderable model): "
              + ", ".join(result["skipped"][:20]) + (" ..." if len(result["skipped"]) > 20 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
