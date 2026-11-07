# Monitoramento do DOE MG

O workflow `Monitorar publicações de AFRE no DOE MG` consulta diariamente a edição do
Diário do Executivo, extrai seu texto e procura atos de exoneração, aposentadoria e
afastamento preliminar à aposentadoria. A identificação combina o MASP com o cargo AFRE.
Férias-prêmio e outros afastamentos não são considerados.

Para cada MASP que exigir alteração no CSV, o workflow abre um pull request separado, em
rascunho, com a proposta e o trecho correspondente do DOE. Assim, cada mudança pode ser
aprovada ou rejeitada individualmente. O site só recebe a alteração após o merge. As edições
manuais continuam disponíveis. Para exonerações, o monitor lê a data efetiva indicada por
“A CONTAR DE” e a data da publicação; se a data efetiva anotada manualmente divergir do DOE,
propõe a correção para aprovação junto com a data de publicação. Para aposentadoria e
afastamento preliminar, usa a data indicada por “A PARTIR DE” e a data da publicação. Se
não conseguir identificar a data efetiva de uma exoneração, não propõe a alteração e sinaliza
o ato para conferência manual.

O workflow tenta consultar a edição às 05h30, 07h30, 09h30, 11h30 e 13h30 (horário de
Brasília), de terça a sábado. Cada tentativa procura a edição mais recente disponível,
recuando até 14 dias; assim, dias sem publicação (incluindo domingos, segundas e feriados)
não interrompem o processo, e uma edição atrasada pode ser encontrada numa tentativa
posterior. Se nenhuma edição estiver disponível, a execução termina sem erro e tenta de
novo no próximo horário.

Também pode ser executado manualmente em **Actions → Monitorar publicações de AFRE no DOE
MG → Run workflow**. Uma data opcional no formato `YYYY-MM-DD` consulta somente aquela
edição; sem data, procura a edição mais recente disponível nos últimos 14 dias.

Para permitir a criação de propostas, habilite a permissão de pull requests para GitHub
Actions nas configurações do repositório, em **Settings → Actions → General → Workflow
permissions**.
