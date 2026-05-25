#!/usr/bin/env python3
"""Reorder evasao/data/dados.csv by AREA, POSICAO_CONCURSO, SITUACAO, and NOME."""

import argparse
import csv
import codecs
import unicodedata
from pathlib import Path

AREA_ORDER = ["FISCALIZAÇÃO", "TI", "TRIBUTAÇÃO", "VETERANO"]
SITUACAO_GROUPS = [
    {
        "APOSENTADO",
        "EXONERADO",
        "AFASTAMENTO PRELIMINAR À APOSENTADORIA",
    },
    {"EM EXERCÍCIO"},
]

DEFAULT_INPUT = Path(__file__).resolve().parents[1] / "data" / "dados.csv"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "dados.sorted.csv"


def normalize_text(value: str) -> str:
    if value is None:
        return ""
    value = value.strip().casefold()
    value = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn")


def parse_position(value: str) -> int:
    if value is None:
        return float("inf")
    value = value.strip()
    if value == "":
        return float("inf")
    try:
        return int(value)
    except ValueError:
        return float("inf")


def sort_key(row: list[str], col_map: dict[str, int]) -> tuple:
    area = normalize_text(row[col_map["AREA"]])
    pos = row[col_map["POSICAO_CONCURSO"]].strip()
    situacao = normalize_text(row[col_map["SITUACAO"]])
    nome = normalize_text(row[col_map["NOME"]])

    area_rank = next((i for i, value in enumerate(AREA_ORDER) if normalize_text(value) == area), len(AREA_ORDER))

    situacao_rank = len(SITUACAO_GROUPS)
    for index, group in enumerate(SITUACAO_GROUPS):
        if situacao in {normalize_text(value) for value in group}:
            situacao_rank = index
            break

    return (area_rank, situacao_rank, parse_position(pos), nome)


def load_rows(path: Path) -> tuple[list[str], list[list[str]], bool]:
    raw = path.read_bytes()
    has_bom = raw.startswith(codecs.BOM_UTF8)

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)

    if not rows:
        raise ValueError(f"CSV file is empty: {path}")

    return rows[0], rows[1:], has_bom


def write_rows(path: Path, header: list[str], rows: list[list[str]], has_bom: bool) -> None:
    encoding = "utf-8-sig" if has_bom else "utf-8"
    with path.open("w", encoding=encoding, newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(header)
        writer.writerows(rows)


def find_columns(header: list[str]) -> dict[str, int]:
    needed = ["AREA", "POSICAO_CONCURSO", "SITUACAO", "NOME"]
    col_map = {}
    for name in needed:
        try:
            col_map[name] = header.index(name)
        except ValueError as exc:
            raise ValueError(f"Missing required column in CSV header: {name}") from exc
    return col_map


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reorder evasao/data/dados.csv by AREA, POSICAO_CONCURSO, SITUACAO, and NOME."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Input CSV file (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output CSV file (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite the input file with the sorted output.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = args.input
    output_path = input_path if args.in_place else args.output

    header, rows, has_bom = load_rows(input_path)
    column_map = find_columns(header)

    rows.sort(key=lambda row: sort_key(row, column_map))
    write_rows(output_path, header, rows, has_bom)

    if args.in_place:
        print(f"Reordered CSV in place: {input_path}")
    else:
        print(f"Reordered CSV written to: {output_path}")


if __name__ == "__main__":
    main()
