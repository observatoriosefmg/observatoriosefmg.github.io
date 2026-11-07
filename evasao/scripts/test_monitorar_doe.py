import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from monitorar_doe import (
    DoeEvent,
    apply_events,
    apply_proposal,
    extract_events,
    fetch_latest_issue,
)


class ExtractEventsTests(unittest.TestCase):
    def test_extracts_only_preliminary_retirement_for_afre(self):
        text = """
        REGISTRA AFASTAMENTO PRELIMINAR À APOSENTADORIA,
        nos termos do §24 do art. 36 da CE/1989, aos servidores:
        Masp 351.372-8, Jose Antonio Lucas, a partir de 15/10/2026,
        referente ao cargo de OSO;
        Masp 386.748-8, Vinicius Fernandes Moreira, a partir de 15/10/2026,
        referente ao cargo de AFRE;
        AUTORIZA AFASTAMENTO PARA GOZO DE FÉRIAS-PRÊMIO.
        """

        events = extract_events(text, 7, "2026-11-04")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "preliminary_retirement")
        self.assertEqual(events[0].masp, "3867488")
        self.assertEqual(events[0].name, "VINICIUS FERNANDES MOREIRA")
        self.assertEqual(events[0].start_date, "15/10/2026")

    def test_uses_publication_date_when_preliminary_retirement_has_no_effective_date(self):
        text = """
        REGISTRA AFASTAMENTO PRELIMINAR À APOSENTADORIA,
        nos termos do §24 do art. 36 da CE/1989, aos servidores:
        Masp 386.748-8, Vinicius Fernandes Moreira,
        referente ao cargo de AFRE;
        """

        events = extract_events(text, 7, "2026-11-04")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "preliminary_retirement")
        self.assertEqual(events[0].start_date, "04/11/2026")

    def test_extracts_afre_exoneration(self):
        text = """
        A Secretaria de Estado de Fazenda exonera, a pedido, nos termos da
        alínea a do art. 106 da Lei nº 869, de 5 de julho de 1952,
        GIRLIAN ANTONIO DOS SANTOS, Masp 755617-8, do cargo de provimento
        efetivo de Auditor Fiscal da Receita Estadual, código AFRE,
        a contar de 28/07/2026.
        """

        events = extract_events(text, 8, "2026-10-29")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "exoneration")
        self.assertEqual(events[0].masp, "7556178")
        self.assertEqual(events[0].name, "GIRLIAN ANTONIO DOS SANTOS")
        self.assertEqual(events[0].start_date, "28/07/2026")

    def test_extracts_final_retirement_for_afre(self):
        text = """
        A SECRETARIA DE ESTADO DE PLANEJAMENTO E GESTÃO DECLARA APOSENTADA,
        A PARTIR DE 06/03/2025, COM PROVENTOS INTEGRAIS, Andrea Polato Thomaz,
        MASP 373.282-3, admissão 1, ocupante do cargo de Auditor Fiscal da
        Receita Estadual, código AFRE, nível II.
        A Secretaria de Estado declara aposentada a servidora seguinte.
        """

        events = extract_events(text, 21, "2026-10-02")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "retirement")
        self.assertEqual(events[0].masp, "3732823")
        self.assertEqual(events[0].name, "ANDREA POLATO THOMAZ")
        self.assertEqual(events[0].start_date, "06/03/2025")

    def test_uses_publication_date_when_final_retirement_has_no_effective_date(self):
        text = """
        A SECRETARIA DE ESTADO DE PLANEJAMENTO E GESTÃO DECLARA APOSENTADA,
        COM PROVENTOS INTEGRAIS, Andrea Polato Thomaz, MASP 373.282-3,
        admissão 1, ocupante do cargo de Auditor Fiscal da Receita Estadual,
        código AFRE, nível II.
        """

        events = extract_events(text, 21, "2026-10-02")

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].kind, "retirement")
        self.assertEqual(events[0].start_date, "02/10/2026")

    def test_does_not_extract_vacation_premium(self):
        text = """
        AUTORIZA AFASTAMENTO PARA GOZO DE FÉRIAS-PRÊMIO aos servidores:
        Masp 667.278-6, Francisco Paulo dos Santos, AFRE, por 1 mês.
        """

        self.assertEqual(extract_events(text, 8, "2026-11-04"), [])


class ApplyEventsTests(unittest.TestCase):
    def test_proposes_retirement_and_corrects_exoneration_effective_date(self):
        rows = [
            {
                "MASP": "3867488",
                "NOME": "VINICIUS FERNANDES MOREIRA",
                "SITUACAO": "EM EXERCÍCIO",
                "DATA_INATIVIDADE": "",
                "DATA_PUBLICACAO_INATIVIDADE": "",
                "DATA_PUBLICACAO_EXONERACAO": "",
            },
            {
                "MASP": "7556178",
                "NOME": "GIRLIAN ANTONIO DOS SANTOS",
                "SITUACAO": "EXONERADO",
                "DATA_EXONERACAO": "01/08/2026",
                "DATA_PUBLICACAO_EXONERACAO": "",
            },
        ]
        events = [
            DoeEvent(
                "preliminary_retirement",
                "3867488",
                "VINICIUS FERNANDES MOREIRA",
                "15/10/2026",
                "2026-11-04",
                7,
                "REGISTRA AFASTAMENTO PRELIMINAR",
            ),
            DoeEvent(
                "exoneration",
                "7556178",
                "GIRLIAN ANTONIO DOS SANTOS",
                "28/07/2026",
                "2026-10-29",
                8,
                "EXONERA A PEDIDO",
            ),
        ]

        updated, changes, review_needed = apply_events(rows, events)

        self.assertEqual(len(changes), 2)
        self.assertEqual(review_needed, [])
        self.assertEqual(updated[0]["SITUACAO"], "AFASTAMENTO PRELIMINAR À APOSENTADORIA")
        self.assertEqual(updated[0]["DATA_INATIVIDADE"], "15/10/2026")
        self.assertEqual(updated[0]["DATA_PUBLICACAO_INATIVIDADE"], "04/11/2026")
        self.assertEqual(updated[1]["DATA_EXONERACAO"], "28/07/2026")
        self.assertEqual(updated[1]["DATA_PUBLICACAO_EXONERACAO"], "29/10/2026")

    def test_sends_exoneration_without_effective_date_for_manual_review(self):
        rows = [
            {
                "MASP": "7556178",
                "NOME": "GIRLIAN ANTONIO DOS SANTOS",
                "SITUACAO": "EXONERADO",
                "DATA_EXONERACAO": "28/07/2026",
                "DATA_PUBLICACAO_EXONERACAO": "",
            }
        ]
        event = DoeEvent(
            "exoneration",
            "7556178",
            "GIRLIAN ANTONIO DOS SANTOS",
            None,
            "2026-10-29",
            8,
            "EXONERA A PEDIDO",
        )

        updated, changes, review_needed = apply_events(rows, [event])

        self.assertEqual(updated[0]["DATA_PUBLICACAO_EXONERACAO"], "")
        self.assertEqual(changes, [])
        self.assertEqual(
            review_needed[0]["reason"],
            "Data efetiva da exoneração não identificada no DOE",
        )

    def test_applies_only_one_proposal_and_detects_conflicts(self):
        fields = [
            "MASP",
            "NOME",
            "SITUACAO",
            "DATA_INATIVIDADE",
            "DATA_PUBLICACAO_INATIVIDADE",
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dados.csv"
            with path.open("w", encoding="utf-8-sig", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=fields, delimiter=";")
                writer.writeheader()
                writer.writerow(
                    {
                        "MASP": "3867488",
                        "NOME": "VINICIUS FERNANDES MOREIRA",
                        "SITUACAO": "EM EXERCÍCIO",
                        "DATA_INATIVIDADE": "",
                        "DATA_PUBLICACAO_INATIVIDADE": "",
                    }
                )

            proposal = {
                "masp": "3867488",
                "name": "VINICIUS FERNANDES MOREIRA",
                "publication_date": "2026-11-04",
                "before": json.dumps(
                    {
                        "SITUACAO": "EM EXERCÍCIO",
                        "DATA_INATIVIDADE": "",
                        "DATA_PUBLICACAO_INATIVIDADE": "",
                    }
                ),
                "after": json.dumps(
                    {
                        "SITUACAO": "AFASTAMENTO PRELIMINAR À APOSENTADORIA",
                        "DATA_INATIVIDADE": "15/10/2026",
                        "DATA_PUBLICACAO_INATIVIDADE": "04/11/2026",
                    }
                ),
            }

            self.assertTrue(apply_proposal(path, proposal))
            self.assertFalse(apply_proposal(path, proposal))

            with path.open(encoding="utf-8-sig", newline="") as file:
                updated = next(csv.DictReader(file, delimiter=";"))
            self.assertEqual(
                updated["SITUACAO"], "AFASTAMENTO PRELIMINAR À APOSENTADORIA"
            )

            updated["SITUACAO"] = "APOSENTADO"
            with path.open("w", encoding="utf-8-sig", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=fields, delimiter=";")
                writer.writeheader()
                writer.writerow(updated)
            proposal["before"] = json.dumps({"SITUACAO": "EM EXERCÍCIO"})
            with self.assertRaisesRegex(RuntimeError, "Conflito"):
                apply_proposal(path, proposal)

    def test_sends_unmatched_masp_for_manual_review(self):
        rows = [{"MASP": "1234567", "NOME": "OUTRA PESSOA"}]
        event = DoeEvent(
            "exoneration", "7654321", "NOVO AFRE", None, "2026-10-29", 8, "EXONERA"
        )

        updated, changes, review_needed = apply_events(rows, [event])

        self.assertEqual(updated, rows)
        self.assertEqual(changes, [])
        self.assertEqual(review_needed[0]["reason"], "MASP ausente ou duplicado no CSV")


class IssueLookupTests(unittest.TestCase):
    @patch("monitorar_doe.fetch_issue_text")
    @patch("monitorar_doe.request_json", return_value={"dados": "test-token"})
    def test_finds_latest_edition_after_days_without_publication(
        self, request_json, fetch_issue_text
    ):
        fetch_issue_text.side_effect = [
            None,
            None,
            ("2026-11-07", ["DOE text"]),
        ]

        issue = fetch_latest_issue("2026-11-09", 14)

        self.assertEqual(issue, ("2026-11-07", ["DOE text"]))
        self.assertEqual(
            [call.args[0] for call in fetch_issue_text.call_args_list],
            ["2026-11-09", "2026-11-08", "2026-11-07"],
        )
        request_json.assert_called_once_with(
            "Autenticacao/Autenticar", payload={}
        )

    @patch("monitorar_doe.fetch_issue_text", return_value=None)
    @patch("monitorar_doe.request_json", return_value={"dados": "test-token"})
    def test_returns_no_edition_when_all_candidate_dates_are_missing(
        self, request_json, fetch_issue_text
    ):
        issue = fetch_latest_issue("2026-11-09", 3)

        self.assertIsNone(issue)
        self.assertEqual(fetch_issue_text.call_count, 3)


if __name__ == "__main__":
    unittest.main()
