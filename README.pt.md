🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml) ![gzip size](docs/badges/size.svg)

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
- A pertinência é declarada duas vezes e precisa bater: todo nó com `territory` está listado em `members` daquele território, e o nó de todo membro aponta de volta para aquele território. `validateSpec` rejeita uma especificação em que as duas discordam, nomeando o caminho.
- **A identidade do território precisa estar ligada ao centroide ou ao conjunto de membros, nunca a um índice de cluster.** Clustering com a mesma entrada e outra seed devolve a mesma partição com rótulos inteiros diferentes, então um produtor que nomeia territórios pelo número do cluster os renomeia em silêncio a cada recomputação, e o mapa que o usuário aprendeu deixa de existir.

## Uso

```tsx
import { CorpusMap, type MapNode, validateSpec } from "corpus-map";

const spec = validateSpec({
  version: "1",
  territories: [{ id: "alkali", name: "Alkali metals", members: ["li"], centroid: [1, 2] }],
  nodes: [{ id: "li", label: "Lithium", x: 1, y: 2, territory: "alkali", meta: { symbol: "Li", atomicNumber: 3 } }],
});

function renderCard(node: MapNode) {
  const meta = node.meta as { symbol: string; atomicNumber: number };
  return (
    <div>
      <strong>{node.label}</strong> ({meta.symbol}, #{meta.atomicNumber})
    </div>
  );
}

<CorpusMap
  spec={spec}
  renderCard={renderCard}
  width={960}
  height={640}
  onSelect={(node) => console.log("selected", node.id)}
  onRegimeChange={(regime) => console.log("now showing", regime)}
/>;
```

`<CorpusMap>` valida `spec` durante a renderização e lança um `SpecError` para uma especificação malformada, o que desmonta o error boundary mais próximo. Envolva o mapa num error boundary ou, como acima, chame `validateSpec` você mesmo antes e trate o erro onde os dados nascem.

`width` e `height` são opcionais. Passe os dois e o mapa se ajusta a eles imediatamente, sem `ResizeObserver`; deixe algum de fora e a raiz preenche o pai (`100%` via CSS) em vez disso, medida por um `ResizeObserver` (o hook `useElementSize`, internamente), sem pintar nada até a primeira medição chegar. Uma caixa com largura ou altura zero, venha de onde vier, conta como caixa ainda inexistente: o mapa não pinta nada e se ajusta à primeira caixa com os dois lados positivos. De qualquer forma, uma mudança de caixa posterior — uma nova medição, ou uma mudança posterior nas props `width`/`height` — mantém a escala atual e mantém o ponto do mundo que estava no centro da caixa antiga no centro da nova, em vez de reajustar e descartar o zoom do usuário. Mudar `spec` continua reajustando o viewport à nova extensão, como antes; não é preciso remontar com `key=` em nenhum dos dois casos. Para reajustar depois de uma mudança de caixa (por exemplo, quando o próprio layout do consumidor muda o espaço disponível), passe um `ref` tipado `CorpusMapHandle` e chame o `fit()` dele — o mesmo handle também expõe `zoomIn()`/`zoomOut()`, um entalhe de roda cada, presos à mesma faixa de zoom que o próprio handler de roda usa.

`onRegimeChange` dispara uma vez na montagem com o regime inicial (`"far"`, `"mid"` ou `"near"`; o tipo `Regime` é exportado) e de novo a cada travessia, então um consumidor pode, por exemplo, mostrar uma legenda só no regime distante. `onViewChange?: (view: CorpusMapView) => void` dispara uma vez na montagem e de novo depois de qualquer render confirmado cujo regime, razão de escala em relação à escala ajustada, ou contagem de nós na tela tenha mudado — no máximo uma vez por quadro de animação durante um arraste, já que arrastos já são agrupados em um commit por quadro; `CorpusMapView` é exportado.

`minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" }` (padrão desligado) adiciona um canvas de 160x110 num canto da caixa, pintando os contornos de território e a visão atual como um retângulo; pressionar ou arrastar nele centraliza a visão principal no ponto do mundo pressionado, através da mesma atualização agrupada que dispara `onViewChange` e que um arraste no próprio mapa usa. `true` escolhe o canto padrão, `"bottom-left"`; `MinimapCorner` é exportado para a forma de objeto.

Cards são decorativos. O overlay em que vivem é `aria-hidden` e `inert`, então nada dentro de um card é focável, entra na ordem de tabulação ou é clicável por conta própria — um clique solto sobre um card dispara `onSelect` com aquele nó, e essa é toda a superfície de interação de um card. Conteúdo interativo pertence à UI do próprio consumidor, guiada por `onSelect`.

`theme` reestiliza o campo de pontos e os contornos de território; tanto o tipo `Theme` quanto o `DEFAULT_THEME` da biblioteca são exportados por `corpus-map`, então um consumidor pode tipar um tema próprio ou partir do padrão e sobrescrever campos individuais.

`thresholds.midAt` e `thresholds.nearAt` são múltiplos da escala ajustada — o zoom no qual o corpus inteiro cabe na caixa — e não valores de escala absolutos, então `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 6 }` abre todo corpus no regime distante, qualquer que seja sua própria extensão, e alcançar o regime médio ou próximo a partir daí exige só um zoom de 2x ou 6x.

`tuning?: Partial<Tuning>` sobrescreve qualquer um dos números que a literatura não resolve, sem tocar em código — sensibilidade da roda, ganho do pinça do trackpad, o teto de zoom por evento, a histerese e a faixa de crossfade do nível de detalhe, o padding do contorno de território, os cortes de tamanho de rótulo, o raio de hover. `Tuning` e `DEFAULT_TUNING` são exportados, então um consumidor (ou um painel de ajuste) pode partir dos padrões e sobrescrever campos individuais do mesmo jeito que `theme`.

`cardSize?: { width: number; height: number }` (padrão `{ width: 160, height: 56 }`) define o quadro que a biblioteca desenha ao redor de cada card; `renderCard` só preenche o conteúdo dele. A biblioteca posiciona esse quadro ao lado do ponto do nó — tentando oito posições candidatas ao redor dele antes de recorrer a agrupar o nó no card já posicionado mais próximo, mostrado com um badge "+ N" — então cards nunca ficam pendurados no canto de um ponto nem se cobrem. Nos regimes médio e próximo, passar o mouse sobre o ponto mais próximo dentro de `tuning.hoverRadius` pixels de tela mostra o nome dele numa pequena dica.

## A demo

Rode `npm run dev` para abrir a demo — uma vitrine em tela cheia, não um preview de componente: o mapa preenche a janela do navegador (`CorpusMap` sem `width`/`height`, preenchendo o pai), uma barra superior escolhe o corpus, um minimapa e um indicador no canto inferior esquerdo (`regime · razão× · N itens`, lido direto de `onViewChange`) ficam acima dele, controles de zoom no canto inferior direito acionam o `CorpusMapHandle` do próprio mapa ("Zoom in", "Zoom out", "Fit"), e um rodapé mostra um aviso de fonte de dados para os corpora que precisam de um. Selecionar um nó abre uma gaveta com o rótulo e o território dele — para o arXiv, também o ano de publicação e um link para a página de resumo do paper; todo outro corpus recebe uma lista genérica de campos a partir do `meta`.

A galeria vem com quatro corpora, arXiv primeiro e selecionado por padrão: "Computer-science papers (arXiv metadata)" (do mundo real, ~8.000 papers, carregado sob demanda por um `import()` dinâmico de `demo/corpora/arxiv.json` para que seus ~1,8 MB nunca bloqueiem a primeira pintura do shell; o rodapé credita ao pé da letra, "Thank you to arXiv for use of its open access interoperability."; construído pelo pacote separado em [pipeline/arxiv/](pipeline/arxiv/README.md)), "Chemical elements", "Constellations" (estrelas brilhantes agrupadas por constelação), e "Synthetic (5,000 items)" (o número no rótulo acompanha o controle de tamanho do painel de tuning; rodapé: "Synthetic corpus, generated for scale testing.") — deliberadamente nenhum é comida: uma especificação de mapa validada por um único domínio seria uma abstração não verificada, e esses quatro são suficientemente distintos entre si para mostrar que a especificação e o ponto de extensão `renderCard` são de fato agnósticos de domínio.

Pressione `t` (ignorado enquanto se digita num campo, ou com Ctrl/Cmd/Alt pressionado) para abrir um painel de ajuste oculto: um controle deslizante por campo de `Tuning`, os dois limiares de LOD, o tamanho do quadro do card, e — para o corpus sintético — seu tamanho e sua seed, cada valor validado pelas próprias `resolveTuning`/`resolveThresholds` exportadas da biblioteca antes de chegar ao mapa, com a mensagem do `RangeError` lançado mostrada inline numa combinação inválida. O mesmo painel guarda uma captura de eventos de roda: um listener passivo e somente leitura no container do mapa, registrando os últimos 50 eventos de roda (`deltaY`, `deltaMode`, `ctrlKey`, milissegundos desde o anterior) com um botão "Copy" — para ler o que um trackpad ou mouse realmente envia, de modo que os padrões de ajuste da biblioteca (tirados do d3-zoom e do MapLibre, ver `src/shared/tuning.ts`) possam ser conferidos contra dispositivos reais. O painel e a gaveta do item selecionado dividem o mesmo espaço à direita e são mutuamente exclusivos (abrir um fecha o outro), e os controles de zoom se deslocam para a esquerda para ficar livres de qualquer um dos dois que esteja aberto sempre que há espaço, ou são cobertos por ele — reversivelmente, um toque ou Escape — em telas mais estreitas.

Em desenvolvimento a demo consome a biblioteca por um alias do Vite para `src/`, não pelo pacote construído; o que prova que o pacote construído é utilizável é o CI, que roda `npm run build` e confere que o `dist/index.d.ts` emitido existe onde o `package.json` diz.

## Garantias

- **Baseline em Canvas 2D, sem exigir WebGPU.** O campo de pontos é renderizado em Canvas 2D; nada nesta biblioteca exige WebGPU ou WebGL para funcionar.
- **Alcançável por teclado e leitor de tela, com uma lacuna conhecida.** Cada nível de zoom é espelhado por uma árvore acessível visualmente oculta e sempre presente, com uma live region anunciando o regime atual. O que é alcançável hoje: nos regimes distante e médio, um botão por território (Enter dá zoom no mapa até ele); no regime próximo, um botão por item na tela, limitado pelo cap, e Enter o seleciona. Zoom-out e pan por teclado ainda não estão implementados, então, uma vez aberto um território, o teclado não consegue sair dele; veja [BACKLOG.md](docs/superpowers/BACKLOG.md).

## Performance

O benchmark em `bench/field.test.ts` (rodado via `npm run bench`) mede apenas o custo de CPU da função `paint` escrevendo em uma `RecordingSurface` em memória, não a rasterização real de um `<canvas>` no navegador — é um gate de regressão sobre a lógica própria do pintor, não uma alegação sobre taxa de quadros no mundo real. Nenhuma taxa de quadros por segundo medida em navegador é alegada ainda.

## Créditos

Veja [CREDITS.md](CREDITS.md) para as referências que inspiraram esta biblioteca, e as restrições de licenciamento que foram respeitadas ao fazer isso.

Este projeto é licenciado sob a [Licença MIT](LICENSE).
