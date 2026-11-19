"""Utilidades comunes para los comandos de línea del pipeline."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

DEFAULT_CONFIG = Path("config.toml")


def build_parser(description: str) -> argparse.ArgumentParser:
    """Crea un parser con las opciones que comparten todos los comandos.

    Args:
        description: Texto de ayuda del comando.

    Returns:
        Parser con ``--config`` y ``--verbose`` ya añadidos.
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Ruta al archivo de configuración (por defecto: {DEFAULT_CONFIG}).",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Muestra mensajes de depuración."
    )
    return parser


def setup_logging(verbose: bool = False) -> None:
    """Configura el logging global con un formato legible.

    Args:
        verbose: Si es ``True`` usa el nivel DEBUG; si no, INFO.
    """
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(levelname)-7s %(name)s: %(message)s",
    )
