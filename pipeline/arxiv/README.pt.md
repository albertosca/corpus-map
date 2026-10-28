🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

# Pipeline do corpus arXiv

`fetch → embed → project → edges → cluster → name → check → export` — flags: `--n` (papers, padrão 8000), `--floor` (mínimo por categoria, padrão 20), `--out` (padrão `demo/corpora`), `--cache-dir` (padrão `.cache`). Roda qualquer estágio sozinho, ou `all` para o pipeline inteiro: `uv run arxiv-corpus <fetch|embed|project|edges|cluster|name|check|export|all> [flags]`.

## O que ele constrói

Este pacote busca uma amostra de papers `cs.*` (ciência da computação) na API ao vivo do arXiv, embeda cada resumo (abstract) num vetor de 384 dimensões com um modelo local pequeno, projeta esses vetores em 2D com UMAP, e escreve `demo/corpora/arxiv.json` — um `MapSpec` do corpus-map, checado duas vezes: uma pelo próprio `export.py` deste pacote, e outra pelo `validateSpec` da biblioteca em `demo/corpora/arxiv.test.ts`, que é o teste que prova que a demo consegue de fato carregá-lo. `demo/corpora/arxiv.meta.json` registra como aquele arquivo foi produzido: a data, o formato da query, o modelo, os parâmetros do UMAP, e a contagem de papers por categoria. Cada paper vira um nó, posicionado por quão semanticamente similar seu resumo é a todos os outros resumos da amostra, então papers sobre tópicos parecidos ficam juntos. Os territórios são os clusters do próprio mapa, não as categorias do arXiv: uma árvore de Ward sobre as coordenadas 2D é cortada duas vezes, em 18-26 folhas sob 5-9 famílias, o Claude nomeia os dois níveis a partir do que cada cluster contém, e um teste cego confere os nomes antes de qualquer gravação (ver [Territórios: clusters, nomes e o teste cego](#territórios-clusters-nomes-e-o-teste-cego)). Cada paper guarda sua categoria do arXiv como atributo: a demo a mostra no card e na gaveta.

## Edges: papers relacionados entre categorias

O estágio `edges` (spec slice E §8) liga cada paper aos vizinhos mais próximos em *outras* categorias: similaridade de cosseno sobre os embeddings em cache, calculada em blocos de 512 linhas para que a matriz 8000 × 8000 nunca fique inteira na memória. Um par só é mantido com similaridade 0,80 ou mais, e cada paper termina com no máximo três edges — cada paper propõe os seus três melhores, e então os pares mais pesados são mantidos primeiro enquanto as duas pontas ainda têm vaga, de modo que um paper com o qual muitos outros se parecem (um hub) não acumula dezenas. Pares dentro de uma mesma categoria ficam de fora de propósito: o mapa já mostra esses pela posição. Um paper cujo embedding é todo zero não se liga a nada.

O `export` grava os edges no `arxiv.json` como triplas compactas `[sourceIndex, targetIndex, weightPercent]` (índices em `nodes`, o menor primeiro) e registra `floor`, `per_paper` e `count` sob `edges` no `arxiv.meta.json`; a demo os expande em `MapEdge`s ao carregar o arquivo, escrevendo o motivo de cada edge a partir das palavras que os dois títulos compartilham (`demo/corpora/edges.ts`), para que o arquivo não carregue esse texto duas vezes. O mesmo vale para dois outros campos que todo nó poderia carregar: os territórios saem sem `members` (cada nó já nomeia o seu território) e os nós sem `meta` (o ano e a url da página do resumo saem ambos do id do arXiv), e a demo reconstrói os dois ao carregar (`demo/corpora/compact.ts`), o que deixa o arquivo cerca de 30% menor. O `export` recusa um paper cujo ano de publicação não é o ano que o id dá, então o ano reconstruído nunca sai errado. O `edges.json` carrega a impressão digital dos embeddings, e o `export` recusa um `edges.json` de outros embeddings — rode `edges` de novo depois do `embed`. Sem um `edges.json`, o `export` escreve um spec sem edges.

## Territórios: clusters, nomes e o teste cego

As categorias do arXiv se sobrepõem no mapa (a categoria primária de um paper diz pouco sobre onde o resumo dele cai), então 38 territórios de categoria pintavam 38 formas entrelaçadas. Os territórios passam a ser cortados do próprio mapa:

- **`cluster`** monta uma árvore de Ward sobre as coordenadas 2D (scikit-learn) e a corta no número de folhas em 18-26 e no de famílias em 5-9 com a melhor silhouette, de modo que cada família é uma união de folhas inteiras. Imprime as contagens e a contiguidade: a fração dos 10 vizinhos mais próximos de cada paper no mapa que estão na mesma folha. Grava `clusters.json`, com os 10 títulos mais centrais de cada cluster, as palavras que o distinguem (do título e do resumo) e a mistura de categorias.
- **`name`** pede ao Claude (`claude-opus-5-5`) o nome de cada folha (no máximo 32 caracteres) e de cada família (no máximo 20, para o nome caber inteiro num celular de 320 px na vista ajustada), com o limite de tamanho no próprio schema da resposta.
- **`check`** é o teste cego: 20 títulos separados por folha (nunca um título central que o nomeador viu, da folha ou da família dela), cada um mostrado ao Claude só com a lista de nomes, e ele precisa escolher o cluster de onde o título veio. Passa quando cada folha acerta pelo menos 25%, as folhas juntas pelo menos 60%, e cada família pelo menos 70%. Um nível reprovado é renomeado com os títulos que perdeu e testado de novo num sorteio novo, que pula todo título já sorteado, até quatro vezes; uma renomeação nunca repete um nome do outro nível; depois da última, para com um relatório em `check-failed.json` e nada é exportado. Uma rodada com os 38 nomes de categoria do arXiv serve de baseline e é relatada, nunca usada como gate: o lift dela (acerto × número de nomes) tem teto no número de nomes, então 18-26 folhas não conseguem bater 38 categorias.
- **`export`** grava as folhas (cada uma com seu `parent`) e as famílias em `arxiv.json`, a categoria do paper como índice numa tabela `categories`, e `clusters` e `naming` (modelo, versão do prompt, o relatório inteiro do teste) em `arxiv.meta.json`. `demo/corpora/arxiv.test.ts` confere as contagens, a contiguidade (≥ 0,90, recalculada dos nós commitados), o relatório aprovado e que os nomes publicados são os testados.

`name` e `check` chegam ao Claude por `ARXIV_NAMING_BACKEND`: `subscription` (o padrão) roda `claude -p` sem interface na assinatura do Claude Code logada, sem ferramentas, sem salvar sessão e sem as variáveis que desviam o CLI (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`) no ambiente, para rodar na assinatura salvo se as configurações do próprio CLI disserem outra coisa; `api` usa o SDK da Anthropic com o extra `naming` e a `ANTHROPIC_API_KEY`. Os caches dos estágios carregam fingerprints (clusters a partir de papers e coordenadas, nomes a partir dos clusters e da versão do prompt de nomeação, o teste a partir dos nomes), então uma projeção ou corte novo é recusado em vez de pareado com nomes velhos.

A execução de 2026-10-28 cortou 18 folhas em 5 famílias (silhouette 0,363 e 0,395, ambas máximas no menor número permitido) com contiguidade 0,973. Os dois níveis passaram no teste cego na primeira nomeação: as famílias com 0,792 no geral (a mais baixa em 0,738), as folhas com 0,600 no geral (a folha mais baixa em 0,25), exatamente nos dois pisos. Ela é anterior a duas mudanças no teste: títulos centrais de uma família agora também ficam fora dele (1 dos 360 títulos separados naquela execução era um deles), e um novo teste sorteia títulos novos (a execução não precisou de novo teste). Nomear e testar levou 5 chamadas de `claude -p`, cerca de 15 s no `name` e alguns minutos no `check`. Três execuções anteriores não foram publicadas: uma reprovou pela cláusula de baseline acima, outra por folhas presas em 0,25-0,35 sob um piso de 40% por folha (o dono definiu os pisos atuais depois de ler os dois relatórios), e uma passou com nomes de família de até 24 caracteres que um celular de 320 px cortava, por isso o limite da família agora é 20.

## Fonte, licença e atribuição

Os metadados do arXiv (título, resumo, categoria e outros campos bibliográficos) estão disponíveis sob CC0 1.0 através da sua API, conforme os [termos de uso](https://info.arxiv.org/help/api/tou.html). Este pipeline usa só esses metadados — nunca o texto completo de um paper, que o arXiv não libera sob CC0. Como os termos exigem, todo corpus construído por este pipeline carrega a frase: "Thank you to arXiv for use of its open access interoperability." Essa frase vive no campo `attribution` de `arxiv.meta.json`, ao pé da letra, e pertence a qualquer lugar onde a demo credite suas fontes de dados.

## Sem nomes de autores

O CC0 cobre nomes de autores também, mas este pipeline os descarta mesmo assim: um mapa público e navegável com nomes de pessoas reais — pesquisável, capturável em screenshot, permanentemente ligado ao título de um paper específico — adiciona risco a esses autores sem nenhum benefício para a vitrine, que só precisa demonstrar que a biblioteca consegue renderizar um corpus real. O `fetch.py` nunca lê o elemento `<author>` do feed do arXiv, para começar, e `arxiv.test.ts` percorre o JSON exportado inteiro recursivamente, checando que nenhuma chave chamada `author` ou `authors` existe em qualquer profundidade — não é uma amostragem pontual, é uma prova.

## Como rodar de novo

```bash
cd pipeline/arxiv
uv sync --extra model --extra naming   # PyTorch, sentence-transformers, umap-learn (~1 GB em disco); o SDK da Anthropic
uv run arxiv-corpus all --n 8000 --floor 20   # name e check chamam o Claude por `claude -p` por padrão
```

Cada estágio guarda sua saída em cache sob `.cache/` (ignorado pelo git), então uma execução falha ou interrompida não custa nada pra tentar de novo — rodar `uv run arxiv-corpus fetch` de novo retoma de onde o cache de respostas parou, e `embed`/`project`/`export` cada um lê o cache do estágio anterior em vez de repeti-lo. A instalação base (sem `--extra model`) nunca baixa PyTorch; esse extra é opcional e só é necessário pra rodar o `embed` de verdade — a suíte de testes e o CI nunca precisam dele, já que `embed.py` e `project.py` ficam atrás de interfaces pequenas que os testes preenchem com fakes determinísticos.

## O que custou, medido em 2026-09-23

| Passo | Medição |
| --- | --- |
| `uv sync --extra model` | 41 pacotes instalados, 11 baixados (~144 MB, majoritariamente PyTorch); 3,8 s com o cache de pacotes já quente |
| Tamanho do `.venv` | 129 MB na instalação base, 1,0 GB com o extra `model` |
| Teste de fumaça com 50 resumos | carga do modelo 39,0 s (inclui o download único dos pesos pelo Hugging Face), embed 0,16 s, RSS de pico ~480 MB |
| `fetch --n 8000 --floor 20` | 7 min 03 s, 116 requisições HTTP com throttle (uma a cada 3+ segundos) contra `export.arxiv.org` |
| `embed` (8.000 resumos) | 8 min 18 s, RSS de pico ~1,28 GB |
| `project` (UMAP) | 32,3 s, RSS de pico ~391 MB |
| `export` | 0,3 s |
| **Tempo total, do fetch ao export** | **~15 min 54 s** |
| Saída | `arxiv.json` 1,38 MB (8.000 nós, 38 territórios); `arxiv.meta.json` 1,2 KB |

38 das 40 categorias `cs.*` em `categories.py` viraram territórios — `cs.NA` e `cs.SY` genuinamente retornaram zero papers para a query de contagem inteira nesta execução, cross-lists incluídos, não só a própria categoria primária (ambas costumam ser cross-listed em vez de primárias em outro lugar: `math.NA` e `eess.SY`), o que é esperado, não um bug — `sample.py` dá cota `0` a uma categoria com `total == 0` em vez de forçar o piso (`floor`) numa categoria vazia.

O corpus commitado também foi construído com uma versão anterior da regra de redução de cota de `sample.py`, que tirava todo o excedente da categoria que estivesse maior no momento em vez de distribuir proporcionalmente: os 43 papers acima da meta `--n 8000` saíram todos de `cs.LG` sozinha (1.592 → 1.549). O `sample.py` agora reduz proporcionalmente, mas o corpus não está sendo reconstruído só por causa disso; uma futura atualização (ver abaixo) vai usar a regra corrigida.

## Duas coisas que esta execução encontrou e que o spec de design não previu

As duas foram verificadas ao vivo (reproduzidas com `curl` puro e com um segundo cliente HTTP, não teorizadas) antes de serem corrigidas, e as duas estão documentadas no ponto exato do código onde foram corrigidas:

- **A query de contagem da API do arXiv (`max_results=0`) retorna erro 500 de forma reproduzível.** `Client.total()` agora pede `max_results=1` em vez disso — o mesmo campo `opensearch:totalResults`, mais uma entrada não usada, sem custo extra contra o throttle de 3 segundos.
- **`urllib.request` é bloqueado pela borda do arXiv com um HTTP 406 reproduzível, enquanto `curl` e `httpx` têm sucesso contra a URL e os headers idênticos, no mesmo instante** — um bloqueio por fingerprint do cliente, não algo que este pacote esteja enviando de errado. A chamada de rede em `fetch.py` agora passa por `httpx`, promovido de dependência transitiva do extra `model` (o `sentence-transformers` já o puxa) para uma dependência direta e pequena da instalação base.

## Rodando de novo para atualizar

Rodar `all` de novo com o mesmo `--n`/`--floor` **replaya o cache de respostas em disco e reproduz o corpus exatamente igual** — toda requisição de contagem e de página que este pipeline faz fica em cache para sempre sob `.cache/responses/` (indexado pela URL completa da requisição), então uma nova execução sem mudança no cache não pergunta nada ao arXiv e escreve uma saída byte a byte idêntica. É isso que torna uma execução falha ou interrompida grátis para tentar de novo (ver acima); também significa que rodar `all` de novo *não* é como se pega o que o arXiv publicou desde a última busca.

Para de fato atualizar o corpus com papers mais novos, apague o cache de respostas primeiro, e só então rode de novo:

```bash
cd pipeline/arxiv
rm -rf .cache/responses
uv run arxiv-corpus all --n 8000 --floor 20
```

O `fetch` pede os papers *mais recentes* de cada categoria, então uma vez que o cache de respostas suma, a próxima execução pega o que foi submetido ao arXiv desde então. `embed`, `project`, `edges` e `export` funcionam todos a partir de uma impressão digital (fingerprint) dos papers que o `fetch` de fato escreveu, então uma atualização não consegue parear silenciosamente papers novos com coordenadas antigas (ou vice-versa), mesmo quando o corpus atualizado tem exatamente o mesmo número de papers por categoria. O layout do UMAP também não é garantidamente reprodutível bit a bit entre máquinas diferentes mesmo com `random_state` fixo — `arxiv.meta.json` registra os parâmetros usados, não uma promessa de que o UMAP de outra máquina reproduz as mesmas coordenadas. O `arxiv.json` commitado é o artefato; nada na demo ou na suíte de testes depende das suas coordenadas exatas.
