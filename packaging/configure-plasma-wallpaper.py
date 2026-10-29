#!/usr/bin/env python3
"""Keep Plasma desktop wallpapers mounted in the Eyes wallpaper plugin."""

from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


DESKTOP_PLUGIN = "org.kde.plasma.folder"
WALLPAPER_PLUGIN = "org.eyes.wallpaper"
DEFAULT_COLOR = "#d8d2df"
DEFAULT_FILL_MODE = "2"
RUNTIME_SCRIPT = (
    'desktops().forEach(function(desktop) { '
    'desktop.wallpaperPlugin = "org.eyes.wallpaper"; });'
)


def local_image_path(value: str) -> Path | None:
    value = value.strip()
    if not value or value == "null":
        return None
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme != "file":
        return None
    path_text = unquote(parsed.path) if parsed.scheme == "file" else value
    path = Path(path_text).expanduser()
    return path if path.is_file() else None


def resolve_image(value: str) -> str:
    """Resolve Plasma's wallpaper package identifiers for a plain Image."""
    value = value.strip()
    direct = local_image_path(value)
    if direct is not None:
        return direct.as_uri()

    candidate = value
    if candidate.startswith("file://"):
        candidate = unquote(urlparse(candidate).path)
    path = Path(candidate).expanduser()
    if not path.is_absolute():
        for root in (
            Path(
                os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")
            )
            / "wallpapers",
            Path.home() / ".local/share/wallpapers",
            Path("/usr/share/wallpapers"),
        ):
            if (root / path).is_dir():
                path = root / path
                break
    if not path.is_dir():
        return value

    # Plasma package wallpapers commonly expose several size and dark-mode
    # variants. Let QML handle a light/dark suffix, but feed it a single file.
    images = sorted(
        item
        for item in (path / "contents").glob("images/*")
        if item.is_file()
        and item.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".avif"}
    )
    if not images:
        return value
    preferred = [item for item in images if "5120" in item.name]
    return (preferred[0] if preferred else images[-1]).as_uri()


def first_image_in_slide_paths(value: str) -> str:
    """Return a concrete image from the list syntax Plasma stores."""
    for match in re.findall(r"(?:file://)?/[^,\[\]\"']+", value):
        candidate = match.strip()
        direct = resolve_image(candidate)
        if local_image_path(direct) is not None:
            return direct
        folder_value = (
            unquote(urlparse(candidate).path)
            if candidate.startswith("file://")
            else candidate
        )
        folder = Path(folder_value)
        if folder.is_dir():
            for item in sorted(folder.rglob("*")):
                if item.is_file() and item.suffix.lower() in {
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".webp",
                    ".avif",
                }:
                    return item.as_uri()
    return ""


def containment_sections(parser: configparser.RawConfigParser) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    for section in parser.sections():
        match = re.fullmatch(r"Containments\]\[(\d+)", section)
        if not match:
            continue
        if parser.get(section, "formfactor", fallback="").strip() != "0":
            continue
        if parser.get(section, "plugin", fallback="").strip() != DESKTOP_PLUGIN:
            continue
        result.append((match.group(1), section))
    return result


def image_candidates(
    parser: configparser.RawConfigParser,
    base: str,
) -> dict[str, str]:
    prefix = f"{base}][Wallpaper]["
    suffix = "][General"
    candidates: dict[str, str] = {}
    for section in parser.sections():
        if not section.startswith(prefix) or not section.endswith(suffix):
            continue
        plugin = section[len(prefix) : -len(suffix)]
        image = parser.get(section, "Image", fallback="").strip()
        if image:
            candidates[plugin] = image
    return candidates


def wallpaper_sections(
    parser: configparser.RawConfigParser,
    base: str,
) -> dict[str, configparser.SectionProxy]:
    prefix = f"{base}][Wallpaper]["
    suffix = "][General"
    result: dict[str, configparser.SectionProxy] = {}
    for section in parser.sections():
        if section.startswith(prefix) and section.endswith(suffix):
            plugin = section[len(prefix) : -len(suffix)]
            result[plugin] = parser[section]
    return result


def write_value(
    executable: str,
    config_path: Path,
    group: list[str],
    key: str,
    value: str,
    *,
    dry_run: bool,
) -> None:
    args = [executable, "--file", str(config_path)]
    for item in group:
        args.extend(["--group", item])
    args.extend(["--key", key, "--notify", value])
    if dry_run:
        print("would run:", " ".join(args), file=sys.stderr)
        return
    subprocess.run(args, check=True)


def activate_runtime(*, dry_run: bool) -> tuple[bool, list[str], str]:
    """Switch the live Plasma containment after its config has been migrated."""
    executable = next(
        (
            found
            for name in ("qdbus6", "qdbus-qt6", "qdbus")
            if (found := shutil.which(name))
        ),
        "",
    )
    command = [
        executable or "qdbus6",
        "org.kde.plasmashell",
        "/PlasmaShell",
        "org.kde.PlasmaShell.evaluateScript",
        RUNTIME_SCRIPT,
    ]
    if dry_run:
        print("would run:", " ".join(command), file=sys.stderr)
        return True, command, ""
    if not executable:
        return False, [], "Eyes: qdbus6 is required to refresh the live wallpaper"
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode == 0:
        return True, command, ""
    detail = (result.stderr or result.stdout).strip()
    return (
        False,
        command,
        "Eyes: unable to refresh the live Plasma wallpaper"
        + (f": {detail}" if detail else ""),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(
            os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")
        )
        / "plasma-org.kde.plasma.desktop-appletsrc",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print a machine-readable result without changing its meaning.",
    )
    parser.add_argument(
        "--activate-runtime",
        action="store_true",
        help="Switch already-running Plasma desktops to the Eyes wallpaper plugin.",
    )
    args = parser.parse_args()

    config_path = args.config.expanduser()
    if not config_path.is_file():
        message = f"Eyes: Plasma desktop config not found: {config_path}"
        if args.json:
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
        else:
            print(message, file=sys.stderr)
        return 1

    config = configparser.RawConfigParser(
        interpolation=None,
        strict=False,
        delimiters=("=",),
    )
    config.optionxform = str
    config.read(config_path, encoding="utf-8")

    desktops = containment_sections(config)
    if not desktops:
        message = (
            "Eyes: no Plasma desktop containment was found; "
            "panels were left untouched"
        )
        if args.json:
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
        else:
            print(message, file=sys.stderr)
        return 1

    fallback_image = ""
    for _, section in desktops:
        candidates = image_candidates(config, section)
        for image in candidates.values():
            if image:
                fallback_image = resolve_image(image)
                break
        if fallback_image:
            break

    executable = shutil.which("kwriteconfig6")
    if executable is None and not args.dry_run:
        message = "Eyes: kwriteconfig6 is required to configure Plasma"
        if args.json:
            print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
        else:
            print(message, file=sys.stderr)
        return 1

    changed: list[str] = []
    pending: list[str] = []
    actions: list[list[str]] = []
    containments: list[dict[str, object]] = []
    for containment_id, section in desktops:
        old_plugin = config.get(section, "wallpaperplugin", fallback="").strip()
        candidates = image_candidates(config, section)
        sections = wallpaper_sections(config, section)
        eyes_config = sections.get(WALLPAPER_PLUGIN)
        active_config = sections.get(old_plugin)

        # A wallpaper switch writes the active plugin's image. Prefer that
        # fresh value over Eyes' previous copy, otherwise every theme or
        # wallpaper change would be silently reverted to the stale wallpaper.
        image = ""
        color = ""
        fill_mode = ""
        use_active_config = (
            active_config is not None and old_plugin != WALLPAPER_PLUGIN
        )
        color_only = False
        if use_active_config:
            image = resolve_image(
                active_config.get("Image", fallback="").strip()
            )
            color = active_config.get("Color", fallback="").strip()
            fill_mode = active_config.get("FillMode", fallback="").strip()
            if not image:
                image = first_image_in_slide_paths(
                    active_config.get("SlidePaths", fallback="").strip()
                )
            raw_image = active_config.get("Image", fallback="").strip()
            color_only = (
                old_plugin in {"org.kde.color", "org.kde.image"}
                and not raw_image
                and bool(color)
            )

        if not color_only and not image and eyes_config is not None:
            image = resolve_image(
                eyes_config.get("Image", fallback="").strip()
            )
        if not color and eyes_config is not None:
            color = eyes_config.get("Color", fallback="").strip()
        if not fill_mode and eyes_config is not None:
            fill_mode = eyes_config.get("FillMode", fallback="").strip()
        if not color_only and not image and candidates:
            image = resolve_image(next(iter(candidates.values())))
        if not color_only and not image:
            image = fallback_image
        if not image and not color:
            pending.append(containment_id)
            containments.append(
                {
                    "id": containment_id,
                    "plugin": old_plugin,
                    "changed": False,
                    "pending": True,
                }
            )
            continue

        color = color or DEFAULT_COLOR
        fill_mode = fill_mode or DEFAULT_FILL_MODE
        common = ["Containments", containment_id]
        wallpaper_group = common + ["Wallpaper", WALLPAPER_PLUGIN, "General"]
        desired = (
            ("Image", image),
            ("Color", color),
            ("FillMode", fill_mode),
        )
        containment_changed = False
        for key, value in desired:
            current = (
                eyes_config.get(key, fallback="").strip()
                if eyes_config is not None
                else ""
            )
            if current == value:
                continue
            call = [executable or "kwriteconfig6", "--file", str(config_path)]
            for item in wallpaper_group:
                call.extend(["--group", item])
            call.extend(["--key", key, "--notify", value])
            actions.append(call)
            write_value(
                executable or "kwriteconfig6",
                config_path,
                wallpaper_group,
                key,
                value,
                dry_run=args.dry_run,
            )
            containment_changed = True

        if old_plugin != WALLPAPER_PLUGIN:
            call = [executable or "kwriteconfig6", "--file", str(config_path)]
            for item in common:
                call.extend(["--group", item])
            call.extend(
                ["--key", "wallpaperplugin", "--notify", WALLPAPER_PLUGIN]
            )
            actions.append(call)
            write_value(
                executable or "kwriteconfig6",
                config_path,
                common,
                "wallpaperplugin",
                WALLPAPER_PLUGIN,
                dry_run=args.dry_run,
            )
            containment_changed = True

        if containment_changed:
            changed.append(containment_id)
        containments.append(
            {
                "id": containment_id,
                "plugin": old_plugin,
                "changed": containment_changed,
                "pending": False,
            }
        )

    if not changed and len(pending) == len(desktops):
        message = "Eyes: no desktop wallpaper could be preserved yet"
        if args.json:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "changed": False,
                        "pending": pending,
                        "containments": containments,
                        "error": message,
                    },
                    ensure_ascii=False,
                )
            )
        else:
            print(message, file=sys.stderr)
        return 1

    if args.activate_runtime:
        runtime_ok, runtime_action, runtime_error = activate_runtime(
            dry_run=args.dry_run
        )
        if runtime_action:
            actions.append(runtime_action)
        if not runtime_ok:
            pending.append("runtime")
            if args.json:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "changed": bool(changed),
                            "pending": pending,
                            "containments": containments,
                            "actions": actions,
                            "error": runtime_error,
                        },
                        ensure_ascii=False,
                    )
                )
            else:
                print(runtime_error, file=sys.stderr)
            return 1

    if not changed:
        if args.json:
            print(
                json.dumps(
                    {
                        "ok": True,
                        "changed": False,
                        "pending": pending,
                        "containments": containments,
                        "actions": actions,
                    },
                    ensure_ascii=False,
                )
            )
        else:
            print("Eyes: desktop wallpapers are already mounted")
        return 0

    if args.json:
        print(
            json.dumps(
                {
                    "ok": True,
                    "changed": True,
                    "pending": pending,
                    "containments": containments,
                    "actions": actions,
                },
                ensure_ascii=False,
            )
        )
    else:
        print(f"Eyes: configured desktop containments: {', '.join(changed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
