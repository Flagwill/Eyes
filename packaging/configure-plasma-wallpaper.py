#!/usr/bin/env python3
"""Move Plasma desktop wallpapers to Eyes while preserving their images."""

from __future__ import annotations

import argparse
import configparser
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


DESKTOP_PLUGIN = "org.kde.plasma.folder"
WALLPAPER_PLUGIN = "org.eyes.wallpaper"


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
        print("would run:", " ".join(args))
        return
    subprocess.run(args, check=True)


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
    args = parser.parse_args()

    config_path = args.config.expanduser()
    if not config_path.is_file():
        print(f"Eyes: Plasma desktop config not found: {config_path}", file=sys.stderr)
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
        print(
            "Eyes: no Plasma desktop containment was found; panels were left untouched",
            file=sys.stderr,
        )
        return 1

    fallback_image = ""
    for _, section in desktops:
        candidates = image_candidates(config, section)
        for image in candidates.values():
            if image:
                fallback_image = image
                break
        if fallback_image:
            break

    executable = shutil.which("kwriteconfig6")
    if executable is None and not args.dry_run:
        print("Eyes: kwriteconfig6 is required to configure Plasma", file=sys.stderr)
        return 1

    changed: list[str] = []
    for containment_id, section in desktops:
        old_plugin = config.get(section, "wallpaperplugin", fallback="").strip()
        candidates = image_candidates(config, section)
        image = candidates.get(WALLPAPER_PLUGIN, "")
        if not image:
            image = candidates.get(old_plugin, "")
        if not image and candidates:
            image = next(iter(candidates.values()))
        if not image:
            image = fallback_image
        if not image:
            print(
                f"Eyes: containment {containment_id} has no readable image; skipped",
                file=sys.stderr,
            )
            continue

        common = ["Containments", containment_id]
        wallpaper_group = common + ["Wallpaper", WALLPAPER_PLUGIN, "General"]
        write_value(
            executable or "kwriteconfig6",
            config_path,
            wallpaper_group,
            "Image",
            image,
            dry_run=args.dry_run,
        )
        write_value(
            executable or "kwriteconfig6",
            config_path,
            common,
            "wallpaperplugin",
            WALLPAPER_PLUGIN,
            dry_run=args.dry_run,
        )
        changed.append(containment_id)

    if not changed:
        print("Eyes: no desktop wallpaper image could be preserved", file=sys.stderr)
        return 1

    print(f"Eyes: configured desktop containments: {', '.join(changed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
