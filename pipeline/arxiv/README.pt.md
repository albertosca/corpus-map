🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

# Pipeline do corpus arXiv

`fetch → embed → project → export` — flags: `--n` (papers, padrão 8000), `--floor` (mínimo por categoria, padrão 20), `--out` (padrão `demo/corpora`), `--cache-dir` (padrão `.cache`). Roda qualquer estágio sozinho, ou `all` para o pipeline inteiro: `uv run arxiv-corpus <fetch|embed|project|export|all> [flags]`.

## O que ele constrói

Este pacote busca uma amostra de papers `cs.*` (ciência da computação) na API ao vivo do arXiv, embeda cada resumo (abstract) num vetor de 384 dimensões com um modelo local pequeno, projeta esses vetores em 2D com UMAP, e escreve `demo/corpora/arxiv.json` — um `MapSpec` do corpus-map, checado duas vezes: uma pelo próprio `export.py` deste pacote, e outra pelo `validateSpec` da biblioteca em `demo/corpora/arxiv.test.ts`, que é o teste que prova que a demo consegue de fato carregá-lo. `demo/corpora/arxiv.meta.json` registra como aquele arquivo foi produzido: a data, o formato da query, o modelo, os parâmetros do UMAP, e a contagem de papers por categoria. Cada categoria do arXiv vira um território no mapa; cada paper vira um nó, posicionado por quão semanticamente similar seu resumo é a todos os outros resumos da amostra — papers sobre tópicos parecidos ficam agrupados, e os territórios nomeados são as categorias `cs.*` que o próprio arXiv atribui.

## Fonte, licença e atribuição

Os metadados do arXiv (título, resumo, categoria e outros campos bibliográficos) estão disponíveis sob CC0 1.0 através da sua API, conforme os [termos de uso](https://info.arxiv.org/help/api/tou.html). Este pipeline usa só esses metadados — nunca o texto completo de um paper, que o arXiv não libera sob CC0. Como os termos exigem, todo corpus construído por este pipeline carrega a frase: "Thank you to arXiv for use of its open access interoperability." Essa frase vive no campo `attribution` de `arxiv.meta.json`, ao pé da letra, e pertence a qualquer lugar onde a demo credite suas fontes de dados.

## Sem nomes de autores

O CC0 cobre nomes de autores também, mas este pipeline os descarta mesmo assim: um mapa público e navegável com nomes de pessoas reais — pesquisável, capturável em screenshot, permanentemente ligado ao título de um paper específico — adiciona risco a esses autores sem nenhum benefício para a vitrine, que só precisa demonstrar que a biblioteca consegue renderizar um corpus real. O `export.py` nunca lê o elemento `<author>` do feed do arXiv, para começar, e `arxiv.test.ts` percorre o JSON exportado inteiro recursivamente, checando que nenhuma chave chamada `author` ou `authors` existe em qualquer profundidade — não é uma amostragem pontual, é uma prova.

## Como rodar de novo

```bash
cd pipeline/arxiv
uv sync --extra model      # baixa PyTorch, sentence-transformers, umap-learn (~1 GB em disco)
uv run arxiv-corpus all --n 8000 --floor 20
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
| Saída | `arxiv.json` 1,79 MB (8.000 nós, 38 territórios); `arxiv.meta.json` 1,2 KB |

38 das 40 categorias `cs.*` em `categories.py` viraram territórios — `cs.NA` e `cs.SY` genuinamente retornaram zero papers sob sua própria categoria primária na API ao vivo nesta execução (ambas costumam ser cross-listed em vez de primárias em outro lugar: `math.NA` e `eess.SY`), o que é esperado, não um bug — `sample.py` dá cota `0` a uma categoria com `total == 0` em vez de forçar o piso (`floor`) numa categoria vazia.

## Duas coisas que esta execução encontrou e que o spec de design não previu

As duas foram verificadas ao vivo (reproduzidas com `curl` puro e com um segundo cliente HTTP, não teorizadas) antes de serem corrigidas, e as duas estão documentadas no ponto exato do código onde foram corrigidas:

- **A query de contagem da API do arXiv (`max_results=0`) retorna erro 500 de forma reproduzível.** `Client.total()` agora pede `max_results=1` em vez disso — o mesmo campo `opensearch:totalResults`, mais uma entrada não usada, sem custo extra contra o throttle de 3 segundos.
- **`urllib.request` é bloqueado pela borda do arXiv com um HTTP 406 reproduzível, enquanto `curl` e `httpx` têm sucesso contra a URL e os headers idênticos, no mesmo instante** — um bloqueio por fingerprint do cliente, não algo que este pacote esteja enviando de errado. A chamada de rede em `fetch.py` agora passa por `httpx`, promovido de dependência transitiva do extra `model` (o `sentence-transformers` já o puxa) para uma dependência direta e pequena da instalação base.

## Rodando de novo para atualizar

Rodar `all` de novo com o mesmo `--n`/`--floor` não reproduz o mesmo corpus exato: o `fetch` pede os papers *mais recentes* de cada categoria, então uma execução posterior pega o que foi submetido ao arXiv desde então. O layout do UMAP também não é garantidamente reprodutível bit a bit entre máquinas diferentes mesmo com `random_state` fixo — `arxiv.meta.json` registra os parâmetros usados, não uma promessa de que o UMAP de outra máquina reproduz as mesmas coordenadas. O `arxiv.json` commitado é o artefato; nada na demo ou na suíte de testes depende das suas coordenadas exatas.
