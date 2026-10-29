#!/usr/bin/env python3
"""Temporarily mount Eyes over Plasma desktops and restore the exact wallpaper."""

from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


DESKTOP_PLUGIN = "org.kde.plasma.folder"
WALLPAPER_PLUGIN = "org.eyes.wallpaper"
LEGACY_WALLPAPER_PLUGINS = {"com.mio.Eyes"}
DEFAULT_COLOR = "#d8d2df"
DEFAULT_FILL_MODE = "2"
STATE_VERSION = 1
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}


class StateError(RuntimeError):
    pass


def default_config_path() -> Path:
    return (
        Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
        / "plasma-org.kde.plasma.desktop-appletsrc"
    )


def default_state_path() -> Path:
    return (
        Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
        / "eyes"
        / "wallpaper-origin.json"
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
    """Resolve Plasma wallpaper package identifiers to one concrete image."""
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

    images = sorted(
        item
        for item in (path / "contents").glob("images/*")
        if item.is_file()
        and item.suffix.lower() in IMAGE_EXTENSIONS
    )
    if not images:
        return value
    preferred = [item for item in images if "5120" in item.name]
    return (preferred[0] if preferred else images[-1]).as_uri()


def first_image_in_slide_paths(value: str) -> str:
    """Return a concrete image from Plasma's list syntax."""
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
                if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS:
                    return item.as_uri()
    return ""


def read_config(path: Path) -> configparser.RawConfigParser:
    config = configparser.RawConfigParser(
        interpolation=None,
        strict=False,
        delimiters=("=",),
    )
    config.optionxform = str
    config.read(path, encoding="utf-8")
    return config


def containment_sections(
    parser: configparser.RawConfigParser,
) -> list[tuple[str, str]]:
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


def wallpaper_config(
    parser: configparser.RawConfigParser,
    containment_id: str,
) -> dict[str, dict[str, dict[str, str]]]:
    """Snapshot every Wallpaper plugin group for one desktop containment."""
    prefix = f"Containments][{containment_id}][Wallpaper]["
    result: dict[str, dict[str, dict[str, str]]] = {}
    for section in parser.sections():
        if not section.startswith(prefix):
            continue
        parts = section[len(prefix) :].split("][")
        if len(parts) < 2:
            continue
        plugin, subgroup = parts[0], "][".join(parts[1:])
        result.setdefault(plugin, {})[subgroup] = {
            key: value for key, value in parser.items(section, raw=True)
        }
    return result


def general_group(
    groups: dict[str, dict[str, dict[str, str]]],
    plugin: str,
) -> dict[str, str]:
    return groups.get(plugin, {}).get("General", {})


def group_image(group: dict[str, str]) -> str:
    raw = group.get("Image", "").strip()
    image = resolve_image(raw)
    parsed = urlparse(image)
    if (
        image
        and (
            local_image_path(image) is not None
            or parsed.scheme
            or Path(image).suffix.lower() in IMAGE_EXTENSIONS
        )
    ):
        return image
    return first_image_in_slide_paths(group.get("SlidePaths", ""))


def source_image(group: dict[str, str]) -> str:
    """Keep Plasma package URLs intact so dark/light selection stays dynamic."""
    raw = group.get("Image", "").strip()
    if raw and raw != "null":
        return raw
    return first_image_in_slide_paths(group.get("SlidePaths", ""))


def origin_entry(
    parser: configparser.RawConfigParser,
    containment_id: str,
    plugin: str,
    *,
    recovered: bool = False,
) -> dict[str, Any]:
    groups = {
        plugin: sections
        for plugin, sections in wallpaper_config(parser, containment_id).items()
        if plugin != WALLPAPER_PLUGIN and plugin not in LEGACY_WALLPAPER_PLUGINS
    }
    return {
        "plugin": plugin,
        "wallpaper": groups,
        "recovered": recovered,
    }


def recover_origin(
    parser: configparser.RawConfigParser,
    containment_id: str,
) -> dict[str, Any] | None:
    """Infer the wallpaper hidden by releases that mounted Eyes permanently."""
    groups = wallpaper_config(parser, containment_id)
    eyes = general_group(groups, WALLPAPER_PLUGIN)
    eyes_image = group_image(eyes)
    eyes_color = eyes.get("Color", "").strip()
    eyes_fill = eyes.get("FillMode", "").strip()

    scored: list[tuple[int, str]] = []
    for plugin, sections in groups.items():
        if plugin == WALLPAPER_PLUGIN or plugin in LEGACY_WALLPAPER_PLUGINS:
            continue
        general = sections.get("General", {})
        score = 0
        if plugin == "org.kde.image":
            score += 20
        image = group_image(general)
        if eyes_image and image:
            score += 100 if image == eyes_image else -20
        if eyes_color and general.get("Color", "").strip() == eyes_color:
            score += 30
        if eyes_fill and general.get("FillMode", "").strip() == eyes_fill:
            score += 10
        scored.append((score, plugin))

    if not scored:
        return None
    scored.sort(reverse=True)
    if scored[0][0] < 20 or (
        len(scored) > 1 and scored[0][0] == scored[1][0]
    ):
        return None
    return origin_entry(
        parser, containment_id, scored[0][1], recovered=True
    )


def read_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": STATE_VERSION, "containments": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise StateError(
            f"Eyes: cannot read wallpaper origin state: {error}"
        ) from error
    if (
        not isinstance(payload, dict)
        or payload.get("version") != STATE_VERSION
        or not isinstance(payload.get("containments"), dict)
    ):
        raise StateError("Eyes: wallpaper origin state has an unsupported format")
    for containment_id, entry in payload["containments"].items():
        if (
            not isinstance(containment_id, str)
            or not containment_id.isdigit()
            or not isinstance(entry, dict)
            or not isinstance(entry.get("plugin"), str)
            or not entry["plugin"]
            or entry["plugin"] == WALLPAPER_PLUGIN
            or not isinstance(entry.get("wallpaper"), dict)
        ):
            raise StateError(
                "Eyes: wallpaper origin state contains an invalid containment"
            )
    return payload


def remove_state(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return
    try:
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except OSError:
        pass


def write_state(path: Path, containments: dict[str, Any]) -> None:
    if not containments:
        remove_state(path)
        return
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    payload = {
        "version": STATE_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "containments": containments,
    }
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(
                payload,
                handle,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def desired_eyes_values(
    origin: dict[str, Any],
    current_eyes: dict[str, str],
) -> dict[str, str]:
    groups = origin.get("wallpaper", {})
    active = general_group(groups, origin["plugin"])
    image = source_image(active)
    color = active.get("Color", "").strip()
    fill_mode = active.get("FillMode", "").strip()

    if not image:
        for plugin, sections in groups.items():
            if plugin == WALLPAPER_PLUGIN:
                continue
            image = source_image(sections.get("General", {}))
            if image:
                break
    if not image:
        image = source_image(current_eyes)
    if not color:
        color = current_eyes.get("Color", "").strip()
    if not fill_mode:
        fill_mode = current_eyes.get("FillMode", "").strip()
    return {
        "Image": image,
        "Color": color or DEFAULT_COLOR,
        "FillMode": fill_mode or DEFAULT_FILL_MODE,
    }


def write_value(
    executable: str,
    config_path: Path,
    group: list[str],
    key: str,
    value: str,
    *,
    dry_run: bool,
) -> list[str]:
    args = [executable, "--file", str(config_path)]
    for item in group:
        args.extend(["--group", item])
    args.extend(["--key", key, "--notify", value])
    if dry_run:
        print("would run:", " ".join(args), file=sys.stderr)
    else:
        subprocess.run(args, check=True)
    return args


def restore_containment(
    executable: str,
    config_path: Path,
    containment_id: str,
    entry: dict[str, Any],
    *,
    dry_run: bool,
) -> list[list[str]]:
    actions: list[list[str]] = []
    common = ["Containments", containment_id]
    for plugin, subgroups in entry["wallpaper"].items():
        if not isinstance(subgroups, dict) or plugin == WALLPAPER_PLUGIN:
            continue
        for subgroup, values in subgroups.items():
            if not isinstance(values, dict):
                continue
            group = common + ["Wallpaper", plugin] + subgroup.split("][")
            for key, value in values.items():
                actions.append(
                    write_value(
                        executable,
                        config_path,
                        group,
                        key,
                        str(value),
                        dry_run=dry_run,
                    )
                )
    actions.append(
        write_value(
            executable,
            config_path,
            common,
            "wallpaperplugin",
            entry["plugin"],
            dry_run=dry_run,
        )
    )
    return actions


def runtime_script(plugins: dict[str, str]) -> str:
    encoded = json.dumps(plugins, ensure_ascii=True, separators=(",", ":"))
    return (
        f"const targets = {encoded};"
        "desktops().forEach(function(desktop) {"
        "const plugin = targets[String(desktop.id)];"
        "if (plugin) desktop.wallpaperPlugin = plugin;"
        "});"
    )


def activate_runtime(
    plugins: dict[str, str],
    *,
    dry_run: bool,
) -> tuple[bool, list[str], str]:
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
        runtime_script(plugins),
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


def mount(
    args: argparse.Namespace,
    config: configparser.RawConfigParser,
    desktops: list[tuple[str, str]],
    state: dict[str, Any],
    executable: str,
) -> tuple[dict[str, Any], list[str], list[list[str]], list[dict[str, Any]]]:
    changed: list[str] = []
    actions: list[list[str]] = []
    containments: list[dict[str, Any]] = []
    current_state = state["containments"]

    for containment_id, section in desktops:
        current_plugin = config.get(
            section, "wallpaperplugin", fallback=""
        ).strip()
        groups = wallpaper_config(config, containment_id)
        current_eyes = general_group(groups, WALLPAPER_PLUGIN)
        origin = current_state.get(containment_id)

        if current_plugin != WALLPAPER_PLUGIN:
            if current_plugin in LEGACY_WALLPAPER_PLUGINS:
                origin = recover_origin(config, containment_id)
            else:
                origin = origin_entry(
                    config, containment_id, current_plugin
                )
            if origin is None:
                containments.append(
                    {
                        "id": containment_id,
                        "plugin": current_plugin,
                        "changed": False,
                        "pending": True,
                    }
                )
                continue
            current_state[containment_id] = origin
        elif origin is None:
            origin = recover_origin(config, containment_id)
            if origin is not None:
                current_state[containment_id] = origin

        desired = desired_eyes_values(
            origin or {"plugin": "", "wallpaper": {}}, current_eyes
        )
        common = ["Containments", containment_id]
        eyes_group = common + ["Wallpaper", WALLPAPER_PLUGIN, "General"]
        containment_changed = False
        for key, value in desired.items():
            if current_eyes.get(key, "").strip() == value:
                continue
            actions.append(
                write_value(
                    executable,
                    args.config,
                    eyes_group,
                    key,
                    value,
                    dry_run=args.dry_run,
                )
            )
            containment_changed = True
        if current_plugin != WALLPAPER_PLUGIN:
            actions.append(
                write_value(
                    executable,
                    args.config,
                    common,
                    "wallpaperplugin",
                    WALLPAPER_PLUGIN,
                    dry_run=args.dry_run,
                )
            )
            containment_changed = True
        if containment_changed:
            changed.append(containment_id)
        containments.append(
            {
                "id": containment_id,
                "plugin": origin["plugin"] if origin else current_plugin,
                "changed": containment_changed,
                "pending": origin is None and current_plugin == WALLPAPER_PLUGIN,
            }
        )
    return state, changed, actions, containments


def restore(
    args: argparse.Namespace,
    config: configparser.RawConfigParser,
    desktops: list[tuple[str, str]],
    state: dict[str, Any],
    executable: str,
    *,
    recover_legacy: bool,
) -> tuple[
    dict[str, Any],
    list[str],
    list[list[str]],
    list[dict[str, Any]],
    dict[str, str],
]:
    changed: list[str] = []
    actions: list[list[str]] = []
    containments: list[dict[str, Any]] = []
    runtime_plugins: dict[str, str] = {}
    desktop_by_id = dict(desktops)
    current_state = state["containments"]

    for containment_id in list(current_state):
        if containment_id not in desktop_by_id:
            del current_state[containment_id]

    if recover_legacy:
        for containment_id, section in desktops:
            if containment_id in current_state:
                continue
            plugin = config.get(
                section, "wallpaperplugin", fallback=""
            ).strip()
            if plugin != WALLPAPER_PLUGIN:
                continue
            recovered = recover_origin(config, containment_id)
            if recovered is not None:
                current_state[containment_id] = recovered

    for containment_id, section in desktops:
        entry = current_state.get(containment_id)
        if entry is None:
            continue
        current_plugin = config.get(
            section, "wallpaperplugin", fallback=""
        ).strip()
        if current_plugin == WALLPAPER_PLUGIN:
            actions.extend(
                restore_containment(
                    executable,
                    args.config,
                    containment_id,
                    entry,
                    dry_run=args.dry_run,
                )
            )
            changed.append(containment_id)
            runtime_plugins[containment_id] = entry["plugin"]
        elif current_plugin == entry["plugin"]:
            runtime_plugins[containment_id] = entry["plugin"]
        else:
            # The person chose a different wallpaper while Eyes was mounted.
            # Their current choice wins over the saved pre-mount snapshot.
            del current_state[containment_id]
            continue
        containments.append(
            {
                "id": containment_id,
                "plugin": entry["plugin"],
                "changed": current_plugin == WALLPAPER_PLUGIN,
                "recovered": entry.get("recovered", False),
            }
        )
    return state, changed, actions, containments, runtime_plugins


def emit(
    args: argparse.Namespace,
    payload: dict[str, Any],
) -> None:
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    elif payload.get("error"):
        print(payload["error"], file=sys.stderr)
    elif payload.get("changed"):
        print(
            "Eyes: "
            + args.mode
            + " desktop containments: "
            + ", ".join(payload.get("changedIds", []))
        )
    else:
        print(f"Eyes: wallpaper {args.mode} is already up to date")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=default_config_path())
    parser.add_argument("--state-file", type=Path, default=default_state_path())
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--activate-runtime",
        action="store_true",
        help="Apply the plugin change to already-running Plasma desktops.",
    )
    parser.add_argument(
        "--recover-legacy",
        action="store_true",
        help="Infer and restore desktops left permanently on Eyes by old releases.",
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--mount", dest="mode", action="store_const", const="mount")
    modes.add_argument(
        "--restore", dest="mode", action="store_const", const="restore"
    )
    parser.set_defaults(mode="mount")
    args = parser.parse_args()
    if args.recover_legacy:
        args.mode = "restore"

    args.config = args.config.expanduser()
    args.state_file = args.state_file.expanduser()
    if not args.config.is_file():
        emit(
            args,
            {
                "ok": False,
                "error": f"Eyes: Plasma desktop config not found: {args.config}",
            },
        )
        return 1

    try:
        config = read_config(args.config)
        state = read_state(args.state_file)
    except StateError as error:
        emit(args, {"ok": False, "error": str(error)})
        return 1

    desktops = containment_sections(config)
    if not desktops:
        emit(
            args,
            {
                "ok": False,
                "error": (
                    "Eyes: no Plasma desktop containment was found; "
                    "panels were left untouched"
                ),
            },
        )
        return 1

    executable = shutil.which("kwriteconfig6")
    if executable is None and not args.dry_run:
        emit(
            args,
            {
                "ok": False,
                "error": "Eyes: kwriteconfig6 is required to configure Plasma",
            },
        )
        return 1

    runtime_plugins: dict[str, str] = {}
    try:
        if args.mode == "mount":
            state, changed, actions, containments = mount(
                args, config, desktops, state, executable or "kwriteconfig6"
            )
            runtime_plugins = {
                containment_id: WALLPAPER_PLUGIN
                for containment_id, _ in desktops
            }
            if not args.dry_run:
                # Persist the origin before changing any live or saved plugin.
                write_state(args.state_file, state["containments"])
        else:
            state, changed, actions, containments, runtime_plugins = restore(
                args,
                config,
                desktops,
                state,
                executable or "kwriteconfig6",
                recover_legacy=args.recover_legacy,
            )
    except (OSError, subprocess.CalledProcessError) as error:
        emit(
            args,
            {
                "ok": False,
                "mode": args.mode,
                "error": f"Eyes: {args.mode} failed: {error}",
            },
        )
        return 1

    if args.activate_runtime and runtime_plugins:
        runtime_ok, runtime_action, runtime_error = activate_runtime(
            runtime_plugins, dry_run=args.dry_run
        )
        if runtime_action:
            actions.append(runtime_action)
        if not runtime_ok:
            emit(
                args,
                {
                    "ok": False,
                    "mode": args.mode,
                    "changed": bool(changed),
                    "changedIds": changed,
                    "pending": ["runtime"],
                    "containments": containments,
                    "actions": actions,
                    "error": runtime_error,
                },
            )
            return 1

    if args.mode == "restore" and not args.dry_run:
        if args.activate_runtime:
            # The saved origin is complete only after both the file and the
            # running Plasma containment have accepted it.
            for containment_id in runtime_plugins:
                state["containments"].pop(containment_id, None)
        try:
            write_state(args.state_file, state["containments"])
        except OSError as error:
            emit(
                args,
                {
                    "ok": False,
                    "error": f"Eyes: cannot update wallpaper origin state: {error}",
                },
            )
            return 1

    emit(
        args,
        {
            "ok": True,
            "mode": args.mode,
            "changed": bool(changed),
            "changedIds": changed,
            "pending": [
                item["id"] for item in containments if item.get("pending")
            ],
            "containments": containments,
            "actions": actions,
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
