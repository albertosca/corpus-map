🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml)

Os limiares de cobertura de 90% de linhas / 85% de branches são impostos dentro do job `test`, e o relatório lcov é publicado como artefato de CI a cada execução; um badge de cobertura hospedado está deliberadamente ausente até que um serviço de cobertura (Codecov ou similar) seja conectado.

## O que é

`corpus-map` é uma biblioteca React que renderiza coordenadas pré-computadas e territórios nomeados como uma paisagem navegável em zoom, onde o nível de zoom É o nível de abstração — de longe você vê regiões nomeadas, e ao dar zoom uma região se abre em cards individuais de item. Não é uma biblioteca de grafos: ela não desenha arestas, não roda simulação de força e não computa layout — recebe coordenadas e nomes de território que alguém já produziu.

Existem bibliotecas que desenham territórios nomeados com contorno, existem bibliotecas que renderizam cards ricos em DOM para itens individuais, e existem bibliotecas que escalam para milhões de pontos, mas a pesquisa de estado da arte que examinou treze delas não encontrou nenhuma que trate o próprio nível de zoom como o nível de abstração, trocando um território por um card conforme o usuário aproxima o zoom. Essa composição — não qualquer peça isolada — é o que esta biblioteca entrega.

## As três camadas

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Campo de pontos | Canvas 2D, desenhado imperativamente fora da árvore React | Contornos de território, marcas de ponto, a transformação de pan/zoom |
| Overlay de cards | DOM React, posicionado de forma absoluta sobre o canvas | Cards ricos apenas para os itens atualmente visíveis |
| Árvore acessível | DOM React, visualmente oculta, sempre presente | Um espelho navegável por teclado e leitor de tela do nível de zoom atual |

O React nunca renderiza milhares de nós diretamente: ele renderiza o shell, os cards do território atualmente aberto, e a árvore acessível do nível atual, enquanto o canvas é repintado imperativamente sempre que a transformação muda.

## A especificação do mapa

A biblioteca é agnóstica de domínio exatamente na medida em que este contrato é bem definido:

```jsonc
{
  "version": "1",
  "territories": [
    {
      "id": "t1",
      "name": "Alkali metals",
      "members": ["n1", "n2"],
      "centroid": [12.4, -3.1],
      "boundary": [[10.0, -5.0], [14.2, -4.8]]  // opcional
    }
  ],
  "nodes": [
    {
      "id": "n1",
      "label": "Lithium",
      "x": 12.1,
      "y": -3.4,
      "territory": "t1",
      "state": "visited",                        // "visited" | "unvisited"
      "badges": ["stable"],                       // strings opacas, estilizadas pelo consumidor
      "meta": { "symbol": "Li", "atomicNumber": 3 } // opaco; o renderer NUNCA interpreta isso
    }
  ]
}
```

- `meta` é opaco: o renderer repassa direto para o componente de card fornecido pelo consumidor e nunca lê o conteúdo.
- `territory` pode ser `null`: um nó sem território é o caso normal (por exemplo, pontos de ruído de clustering baseado em densidade), não um erro, e ainda assim é renderizado.
- `boundary` é opcional: quando um território não tem um, o renderer computa um hull a partir das coordenadas dos membros; quando presente, o contorno do produtor prevalece.

## Uso

```tsx
import { CorpusMap, type MapNode } from "corpus-map";

function renderCard(node: MapNode) {
  const meta = node.meta as { symbol: string; atomicNumber: number };
  return (
    <div>
      <strong>{node.label}</strong> ({meta.symbol}, #{meta.atomicNumber})
    </div>
  );
}

<CorpusMap spec={spec} renderCard={renderCard} width={960} height={640} />;
```

## A demo

Rode `npm run dev` para abrir o viewer de demonstração, que consome a biblioteca publicada, não seu código-fonte. A galeria vem com dois corpora — elementos da tabela periódica e estrelas brilhantes agrupadas por constelação — e nenhum dos dois é comida, deliberadamente: uma especificação de mapa validada por um único domínio seria uma abstração não verificada, e química e astronomia são domínios suficientemente distintos para mostrar que a especificação e o ponto de extensão `renderCard` são de fato agnósticos de domínio.

## Garantias

- **Baseline em Canvas 2D, sem exigir WebGPU.** O campo de pontos é renderizado em Canvas 2D; nada nesta biblioteca exige WebGPU ou WebGL para funcionar.
- **Navegável por teclado e leitor de tela.** Cada nível de zoom é espelhado por uma árvore acessível visualmente oculta e sempre presente, então o mapa pode ser totalmente explorado sem mouse ou ponteiro.

## Performance

O benchmark em `bench/field.test.ts` (rodado via `npm run bench`) mede apenas o custo de CPU da função `paint` escrevendo em uma `RecordingSurface` em memória, não a rasterização real de um `<canvas>` no navegador — é um gate de regressão sobre a lógica própria do pintor, não uma alegação sobre taxa de quadros no mundo real. Nenhuma taxa de quadros por segundo medida em navegador é alegada ainda.

## Créditos

Veja [CREDITS.md](CREDITS.md) para as referências que inspiraram esta biblioteca, e as restrições de licenciamento que foram respeitadas ao fazer isso.

Licença: a ser escolhida antes de o repositório ficar público.
