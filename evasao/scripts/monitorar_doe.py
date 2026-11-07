#!/usr/bin/env python3
"""Find AFRE retirement and exoneration acts and prepare CSV changes for review."""

import base64
import csv
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

API_BASE = "https://www.jornalminasgerais.mg.gov.br/api/v1/"
CSV_PATH = Path(__file__).resolve().parents[1] / "data" / "dados.csv"
USER_AGENT = "ObservatorioSEFMG-DOE-Monitor/1.0"
RETIREMENT_HEADING = "REGISTRA AFASTAMENTO PRELIMINAR A APOSENTADORIA"
RETIREMENT_RECORD = re.compile(
    r"\bM(?:A)?SP\.?\s*(?P<masp>\d[\d.\s-]{4,14}?),\s*"
    r"(?P<name>[^,;\n]+?),\s*"
    r"(?:A PARTIR DE\s*(?P<date>\d{1,2}/\d{1,2}/\d{4}),\s*)?"
    r"REFERENTE AO CARGO DE\s*(?P<cargo>[A-Z]+)\b"
)
MASP_PATTERN = re.compile(r"\bM(?:A)?SP\.?\s*(?P<masp>\d[\d.\s-]{4,14}?)(?=,)")
DATE_PATTERN = re.compile(r"\bA PARTIR DE\s*(\d{1,2}/\d{1,2}/\d{4})\b")
EXONERATION_DATE_PATTERN = re.compile(
    r"\bA CONTAR DE\s*(\d{1,2}/\d{1,2}/\d{4})\b"
)
AFRE_CARGO_PATTERN = re.compile(
    r"\b(?:CARGO(?:\s+DE|\s+EFETIVO|\s+DE\s+PROVIMENTO\s+EFETIVO)?"
    r".{0,100}\bAFRE\b|CARGO DE AUDITOR FISCAL DA RECEITA ESTADUAL|"
    r"AUDITOR FISCAL DA RECEITA ESTADUAL)\b"
)
EXONERATION_PATTERN = re.compile(r"\bEXONERA\s*,")
RETIREMENT_DECLARATION_PATTERN = re.compile(r"\bDECLARA(?:M)?\s+APOSENTAD[AO]S?\b")
SECTION_BOUNDARY_PATTERN = re.compile(
    r"\b(?:REVOGA|RETIFICA|CONCEDE|AUTORIZA|EXONERA|REGISTRA|"
    r"DECLARA|PUBLICA O ATO)\b"
)


@dataclass(frozen=True)
class DoeEvent:
    kind: str
    masp: str
    name: str
    start_date: str | None
    publication_date: str
    page: int
    evidence: str


def normalize_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    without_accents = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    )
    return re.sub(r"\s+", " ", without_accents).upper()


def normalize_name(value: str) -> str:
    return "".join(char for char in normalize_text(value) if char.isalnum())


def normalize_masp(value: str) -> str:
    return re.sub(r"\D", "", value)


def csv_date(value: str) -> str:
    return datetime.strptime(value, "%Y-%m-%d").strftime("%d/%m/%Y")


def event_name_before(text: str, position: int) -> str:
    preceding = text[max(0, position - 500) : position]
    return preceding.rstrip(" ,").rsplit(",", 1)[-1].strip(" .;:-")


def section_has_boundary(text: str, heading_end: int, record_start: int) -> bool:
    return SECTION_BOUNDARY_PATTERN.search(text, heading_end, record_start) is not None


def extract_events(page_text: str, page_number: int, publication_date: str) -> list[DoeEvent]:
    text = normalize_text(page_text)
    events: list[DoeEvent] = []

    for record in RETIREMENT_RECORD.finditer(text):
        if record.group("cargo") != "AFRE":
            continue
        heading_start = text.rfind(RETIREMENT_HEADING, 0, record.start())
        if heading_start < 0:
            continue
        heading_end = heading_start + len(RETIREMENT_HEADING)
        if section_has_boundary(text, heading_end, record.start()):
            continue
        events.append(
            DoeEvent(
                kind="preliminary_retirement",
                masp=normalize_masp(record.group("masp")),
                name=record.group("name").strip(),
                start_date=record.group("date") or csv_date(publication_date),
                publication_date=publication_date,
                page=page_number,
                evidence=record.group(0),
            )
        )

    declarations = list(RETIREMENT_DECLARATION_PATTERN.finditer(text))
    for index, declaration in enumerate(declarations):
        context_end = (
            declarations[index + 1].start()
            if index + 1 < len(declarations)
            else min(len(text), declaration.end() + 1500)
        )
        context = text[declaration.start() : context_end]
        masps = list(MASP_PATTERN.finditer(context))
        date = DATE_PATTERN.search(context)
        if len(masps) != 1 or not AFRE_CARGO_PATTERN.search(context):
            continue
        masp_match = masps[0]
        events.append(
            DoeEvent(
                kind="retirement",
                masp=normalize_masp(masp_match.group("masp")),
                name=event_name_before(context, masp_match.start()),
                start_date=date.group(1) if date else csv_date(publication_date),
                publication_date=publication_date,
                page=page_number,
                evidence=context.strip(),
            )
        )

    for masp_match in MASP_PATTERN.finditer(text):
        after = text[masp_match.end() : masp_match.end() + 500]
        if not AFRE_CARGO_PATTERN.search(after):
            continue
        preceding = text[max(0, masp_match.start() - 1200) : masp_match.start()]
        exonera_matches = list(EXONERATION_PATTERN.finditer(preceding))
        if exonera_matches:
            exonera = exonera_matches[-1]
            intervening = preceding[exonera.end() :]
            context_start = masp_match.start() - len(preceding)
            exonera_position = context_start + exonera.start()
            if (
                masp_match.start() - exonera_position > 600
                or re.search(r"\b(?:REVOGA|RETIFICA|REGISTRA|CONCEDE|AUTORIZA)\b", intervening)
            ):
                continue
            act_end = len(text)
            for boundary in re.finditer(
                r"\b(?:ATO\s+N(?:O|º|°)?|DECLARA(?:M)?\s+APOSENTAD[AO]S?|"
                r"REGISTRA|EXONERA\s*,)\b",
                text[exonera_position + exonera.end() :],
            ):
                act_end = exonera_position + exonera.end() + boundary.start()
                break
            effective_date = EXONERATION_DATE_PATTERN.search(
                text[exonera_position:act_end]
            )
            name = (
                preceding[exonera.end() :]
                .rstrip(" ,")
                .rsplit(",", 1)[-1]
                .strip(" .;:-")
            )
            events.append(
                DoeEvent(
                    kind="exoneration",
                    masp=normalize_masp(masp_match.group("masp")),
                    name=name,
                    start_date=effective_date.group(1) if effective_date else None,
                    publication_date=publication_date,
                    page=page_number,
                    evidence=(preceding[exonera.start() :] + text[masp_match.start() : masp_match.end() + 500]).strip(),
                )
            )

    unique_events: dict[tuple[str, str, str | None], DoeEvent] = {}
    for event in events:
        unique_events[(event.kind, event.masp, event.start_date)] = event
    return list(unique_events.values())


def request_json(path: str, token: str | None = None, payload: dict | None = None) -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        urllib.parse.urljoin(API_BASE, path),
        data=data,
        headers=headers,
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Falha ao consultar a API do DOE ({path}): {error}") from error


def fetch_issue_text(publication_date: str, token: str) -> tuple[str, list[str]] | None:
    from pypdf import PdfReader

    encoded_date = urllib.parse.quote(publication_date, safe="")
    issue = request_json(
        f"Jornal/ObterEdicaoPorDataPublicacao?dataPublicacao={encoded_date}",
        token=token,
    )
    issue_data = issue.get("dados")
    if not issue_data:
        return None

    archive = (issue_data.get("arquivoCadernoPrincipal") or {}).get("arquivo")
    if not archive:
        raise RuntimeError(
            f"DOE não retornou o caderno principal de {publication_date}: {issue.get('erros')}"
        )
    issue_date = issue_data.get("dataPublicacao")
    if not issue_date:
        raise RuntimeError(f"DOE não informou a data da edição solicitada para {publication_date}")
    try:
        actual_publication_date = datetime.fromisoformat(issue_date).date().isoformat()
    except ValueError as error:
        raise RuntimeError(f"Data inválida da edição do DOE: {issue_date}") from error

    container = base64.b64decode(archive, validate=True)
    pdf_start = container.find(b"%PDF-")
    pdf_end = container.rfind(b"%%EOF")
    if pdf_start < 0 or pdf_end < pdf_start:
        raise RuntimeError(f"Não foi possível localizar o PDF da edição de {publication_date}")
    pdf = container[pdf_start : pdf_end + len(b"%%EOF")]
    reader = PdfReader(io.BytesIO(pdf))
    pages = [page.extract_text() or "" for page in reader.pages]
    if not pages or not any(pages):
        raise RuntimeError(f"Não foi possível extrair texto do DOE de {publication_date}")
    return actual_publication_date, pages


def fetch_latest_issue(start_date: str, lookback_days: int) -> tuple[str, list[str]] | None:
    auth = request_json("Autenticacao/Autenticar", payload={})
    token = auth.get("dados")
    if not token:
        raise RuntimeError(f"API do DOE não forneceu token: {auth.get('erros')}")

    start = date.fromisoformat(start_date)
    for offset in range(lookback_days):
        candidate = (start - timedelta(days=offset)).isoformat()
        issue = fetch_issue_text(candidate, token)
        if issue is not None:
            return issue
    return None


def load_csv(path: Path) -> tuple[list[str], list[dict[str, str]], str]:
    raw = path.read_bytes()
    line_ending = "\r\n" if b"\r\n" in raw else "\n"
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, delimiter=";")
        if not reader.fieldnames:
            raise RuntimeError(f"CSV sem cabeçalho: {path}")
        return reader.fieldnames, list(reader), line_ending


def apply_events(
    rows: list[dict[str, str]], events: list[DoeEvent]
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    by_masp: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        masp = normalize_masp(row.get("MASP", ""))
        if masp:
            by_masp.setdefault(masp, []).append(row)

    changes: list[dict[str, str]] = []
    review_needed: list[dict[str, str]] = []
    for event in events:
        matching_rows = by_masp.get(event.masp, [])
        if len(matching_rows) != 1:
            review_needed.append(
                {
                    "masp": event.masp,
                    "name": event.name,
                    "kind": event.kind,
                    "page": str(event.page),
                    "reason": "MASP ausente ou duplicado no CSV",
                }
            )
            continue
        row = matching_rows[0]
        if event.name and normalize_name(event.name) != normalize_name(row.get("NOME", "")):
            review_needed.append(
                {
                    "masp": event.masp,
                    "name": event.name,
                    "kind": event.kind,
                    "page": str(event.page),
                    "reason": f"Nome no CSV diverge: {row.get('NOME', '')}",
                }
            )
            continue

        updates: dict[str, str] = {}
        publication_date = csv_date(event.publication_date)
        if event.kind == "preliminary_retirement":
            updates = {
                "SITUACAO": "AFASTAMENTO PRELIMINAR À APOSENTADORIA",
                "DATA_INATIVIDADE": event.start_date or "",
                "DATA_PUBLICACAO_INATIVIDADE": publication_date,
            }
        elif event.kind == "retirement":
            updates = {
                "SITUACAO": "APOSENTADO",
                "DATA_INATIVIDADE": event.start_date or "",
                "DATA_PUBLICACAO_INATIVIDADE": publication_date,
            }
        elif event.kind == "exoneration":
            if not event.start_date:
                review_needed.append(
                    {
                        "masp": event.masp,
                        "name": event.name,
                        "kind": event.kind,
                        "page": str(event.page),
                        "reason": "Data efetiva da exoneração não identificada no DOE",
                    }
                )
                continue
            updates = {
                "SITUACAO": "EXONERADO",
                "DATA_EXONERACAO": event.start_date,
                "DATA_PUBLICACAO_EXONERACAO": publication_date,
            }
        else:
            continue

        changed_fields = {
            field: value
            for field, value in updates.items()
            if row.get(field, "") != value
        }
        if not changed_fields:
            continue
        before = {field: row.get(field, "") for field in changed_fields}
        row.update(changed_fields)
        changes.append(
            {
                "id": hashlib.sha256(
                    f"{event.kind}|{event.masp}|{event.start_date}|"
                    f"{event.publication_date}|{event.evidence}".encode()
                ).hexdigest()[:12],
                "kind": event.kind,
                "masp": event.masp,
                "name": row.get("NOME", event.name),
                "publication_date": event.publication_date,
                "page": str(event.page),
                "fields": ", ".join(changed_fields),
                "before": json.dumps(before, ensure_ascii=False),
                "after": json.dumps(changed_fields, ensure_ascii=False),
                "evidence": event.evidence,
            }
        )
    return rows, changes, review_needed


def write_csv(
    path: Path, fieldnames: list[str], rows: list[dict[str, str]], line_ending: str
) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
            delimiter=";",
            lineterminator=line_ending,
            extrasaction="raise",
        )
        writer.writeheader()
        writer.writerows(rows)


def apply_proposal(path: Path, proposal: dict[str, str]) -> bool:
    fieldnames, rows, line_ending = load_csv(path)
    matching_rows = [
        row for row in rows if normalize_masp(row.get("MASP", "")) == proposal["masp"]
    ]
    if len(matching_rows) != 1:
        raise RuntimeError(f"MASP {proposal['masp']} ausente ou duplicado no CSV")

    row = matching_rows[0]
    if normalize_name(row.get("NOME", "")) != normalize_name(proposal["name"]):
        raise RuntimeError(f"Nome do MASP {proposal['masp']} mudou desde a análise do DOE")
    before = json.loads(proposal["before"])
    after = json.loads(proposal["after"])

    for field, expected in before.items():
        current = row.get(field, "")
        if current not in (expected, after.get(field)):
            raise RuntimeError(
                f"Conflito no MASP {proposal['masp']}, campo {field}: "
                f"esperado {expected!r} ou {after.get(field)!r}, encontrado {current!r}"
            )

    changes = {
        field: value
        for field, value in after.items()
        if row.get(field, "") != value
    }
    if not changes:
        return False
    row.update(changes)
    write_csv(path, fieldnames, rows, line_ending)
    return True


def write_step_summary(
    publication_date: str,
    events: list[DoeEvent],
    changes: list[dict[str, str]],
    review_needed: list[dict[str, str]],
) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    source = "https://www.jornalminasgerais.mg.gov.br/"
    lines = [
        f"## Monitoramento do DOE MG — {publication_date}",
        "",
        f"Fonte: [{source}]({source}) · edição do Diário do Executivo.",
        "",
        f"Atos de interesse detectados: **{len(events)}**.",
        f"Alterações propostas para revisão: **{len(changes)}**.",
        f"Atos para conferência manual: **{len(review_needed)}**.",
    ]
    if changes:
        lines.extend(["", "| MASP | Servidor | Ato | Página | Campos propostos |", "|---|---|---|---:|---|"])
        lines.extend(
            f"| {item['masp']} | {item['name']} | {item['kind']} | {item['page']} | {item['fields']} |"
            for item in changes
        )
    if review_needed:
        lines.extend(
            [
                "",
                "| MASP | Servidor no DOE | Ato | Página | Motivo |",
                "|---|---|---|---:|---|",
            ]
        )
        lines.extend(
            f"| {item['masp']} | {item['name']} | {item['kind']} | {item['page']} | {item['reason']} |"
            for item in review_needed
        )
    if events and not changes and not review_needed:
        lines.extend(["", "Os atos encontrados já estão refletidos no CSV; nenhuma proposta foi necessária."])
    elif not events:
        lines.extend(["", "Nenhum ato de aposentadoria, afastamento preliminar à aposentadoria ou exoneração de AFRE foi encontrado."])
    Path(summary_path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_pull_request_body(
    publication_date: str, changes: list[dict[str, str]]
) -> None:
    body_path = os.environ.get("DOE_PR_BODY_FILE")
    if not body_path:
        return
    lines = [
        f"Propostas extraídas do [Diário Oficial de Minas Gerais](https://www.jornalminasgerais.mg.gov.br/), edição de {csv_date(publication_date)}.",
        "",
        "Revise cada proposta antes de marcar este rascunho como pronto. O merge é a aprovação para atualizar os dados publicados.",
    ]
    if not changes:
        lines.extend(["", "Nenhuma alteração no CSV foi proposta nesta execução."])
    for item in changes:
        lines.extend(
            [
                "",
                f"### MASP {item['masp']} — {item['name']}",
                f"- Ato: `{item['kind']}`; página {item['page']}.",
                f"- Campos: {item['fields']}.",
                f"- Antes: `{item['before']}`",
                f"- Proposta: `{item['after']}`",
                f"- Trecho do DOE: > {item['evidence']}",
            ]
        )
    Path(body_path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--apply-proposal":
        proposal_json = os.environ.get("DOE_PROPOSAL")
        if not proposal_json:
            raise RuntimeError("DOE_PROPOSAL não foi informado")
        proposal = json.loads(proposal_json)
        changed = apply_proposal(CSV_PATH, proposal)
        write_pull_request_body(proposal["publication_date"], [proposal])
        print(
            f"{'Proposta aplicada' if changed else 'Proposta já aplicada'}: "
            f"MASP {proposal['masp']}"
        )
        return

    requested_date = os.environ.get("DOE_DATE")
    start_date = requested_date or datetime.now(
        ZoneInfo("America/Sao_Paulo")
    ).date().isoformat()
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
    except ValueError as error:
        raise RuntimeError("DOE_DATE deve estar no formato YYYY-MM-DD") from error

    issue = fetch_latest_issue(start_date, 1 if requested_date else 14)
    if issue is None:
        message = (
            f"Nenhuma edição do DOE encontrada desde {start_date}; "
            "nova tentativa no próximo agendamento."
        )
        summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary_path:
            Path(summary_path).write_text(f"## Monitoramento do DOE MG\n\n{message}\n", encoding="utf-8")
        output_path = os.environ.get("GITHUB_OUTPUT")
        if output_path:
            with Path(output_path).open("a", encoding="utf-8") as output:
                output.write(f"publication_date={start_date}\nproposals=[]\n")
        print(message)
        return
    publication_date, pages = issue
    events = [
        event
        for page_number, text in enumerate(pages, start=1)
        for event in extract_events(text, page_number, publication_date)
    ]
    fieldnames, rows, line_ending = load_csv(CSV_PATH)
    rows, changes, review_needed = apply_events(rows, events)
    if changes and os.environ.get("DOE_SCAN_ONLY") != "1":
        write_csv(CSV_PATH, fieldnames, rows, line_ending)
    write_step_summary(publication_date, events, changes, review_needed)
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output:
            output.write(f"publication_date={publication_date}\n")
            output.write(
                "proposals="
                + json.dumps(changes, ensure_ascii=False, separators=(",", ":"))
                + "\n"
            )
    print(
        json.dumps(
            {
                "publicationDate": publication_date,
                "eventsFound": [asdict(event) for event in events],
                "changesProposed": changes,
                "reviewNeeded": review_needed,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Erro: {error}", file=sys.stderr)
        raise
