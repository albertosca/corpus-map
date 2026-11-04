🇺🇸 [English](README.md) · 🇧🇷 [Português](README.pt.md)

[![CI](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/ci.yml) [![Lint](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml/badge.svg)](https://github.com/albertosca/corpus-map/actions/workflows/lint.yml) ![gzip size](docs/badges/size.svg)

Os limiares de cobertura de 90% de linhas / 85% de branches são impostos dentro do job `test`, e o relatório lcov é publicado como artefato de CI a cada execução; um badge de cobertura hospedado está deliberadamente ausente até que um serviço de cobertura (Codecov ou similar) seja conectado.

## O que é

`corpus-map` é uma biblioteca React que renderiza coordenadas pré-computadas e territórios nomeados como uma paisagem navegável em zoom, onde o nível de zoom É o nível de abstração — de longe você vê regiões nomeadas, e ao dar zoom uma região se abre em seus itens, os mais relevantes rotulados. Não é uma biblioteca de grafos: ela não roda simulação de força e não computa layout — recebe coordenadas e nomes de território que alguém já produziu, e as arestas opcionais que desenha são ligações entre itens que o produtor já posicionou, mostradas para o item sob o cursor e para o selecionado, nunca uma entrada de layout.

Existem bibliotecas que desenham territórios nomeados com contorno, existem bibliotecas que renderizam cards ricos em DOM para itens individuais, e existem bibliotecas que escalam para milhões de pontos, mas a pesquisa de estado da arte que examinou treze delas não encontrou nenhuma que trate o próprio nível de zoom como o nível de abstração, trocando um território por um card conforme o usuário aproxima o zoom. Essa composição — não qualquer peça isolada — é o que esta biblioteca entrega.

Cada um desses vizinhos faz a sua peça melhor do que esta biblioteca. O Embedding Atlas da Apple e o deepscatter escalam para milhões de pontos, enquanto esta biblioteca foi pensada para cerca de 10.000 itens e para aí por escolha; o Embedding Atlas também rotula um campo de pontos hierarquicamente conforme o zoom, e o deepscatter troca a representação de um ponto pelo nível de zoom. O AntV G6 desenha envoltórias côncavas com rótulos que seguem o contorno e sobrepõe nós HTML à cena, o React Flow renderiza cards ricos em DOM, e o DataMapPlot calcula contornos de território por alpha shapes a partir dos pontos membros. Se uma dessas peças sozinha é o que você precisa, uma delas provavelmente é a ferramenta melhor; o [CREDITS.md](CREDITS.md) diz o que as quatro que moldaram uma decisão de design ensinaram a este projeto.

## As três camadas

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Campo de pontos | Canvas 2D, desenhado imperativamente fora da árvore React | Contornos de território, marcas de ponto, a transformação de pan/zoom |
| Overlay de cards | DOM React, posicionado de forma absoluta sobre o canvas | O card do item selecionado |
| Árvore acessível | DOM React, visualmente oculta, sempre presente | Um espelho navegável por teclado e leitor de tela do nível de zoom atual |

O React nunca renderiza milhares de nós diretamente: ele renderiza o shell, o card do item selecionado, e a árvore acessível do nível atual, enquanto o canvas é repintado imperativamente sempre que a transformação muda.

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
      "boundary": [[10.0, -5.0], [14.2, -4.8]], // opcional
      "parent": "metals"                         // opcional: o id de outro território; esse pai lista "members": []
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
  ],
  "edges": [                                     // opcional
    { "source": "n1", "target": "n2", "weight": 0.9, "reason": "same group" }
  ]
}
```

- `meta` é opaco: o renderer repassa direto para o componente de card fornecido pelo consumidor e nunca lê o conteúdo.
- `territory` pode ser `null`: um nó sem território é o caso normal (por exemplo, pontos de ruído de clustering baseado em densidade), não um erro, e ainda assim é renderizado.
- `boundary` é opcional: quando um território não tem um, o renderer computa um hull a partir das coordenadas dos membros; quando presente, o contorno do produtor prevalece.
- A pertinência é declarada duas vezes e precisa bater: todo nó com `territory` está listado em `members` daquele território, e o nó de todo membro aponta de volta para aquele território. `validateSpec` rejeita uma especificação em que as duas discordam, nomeando o caminho.
- `parent` aninha territórios em dois níveis: pai é todo território que outro nomeia como `parent`, ele não lista membros próprios (os membros dele são os dos filhos), um pai não pode ter pai, nós pertencem só a folhas, e `parent` e `group` não podem se misturar numa especificação. Com pais, as visões de longe leem como famílias (uma cor da paleta por família, cada filho um tom mais claro ou mais escuro dela) e as de perto como as folhas.
- `edges` são ligações não direcionadas entre dois nós diferentes e existentes, no máximo uma por par; `weight` é um número finito `>= 0` (a mais pesada desenha primeiro e mais grossa), `reason` uma string não vazia mostrada na lista de relacionados. O mapa desenha as primeiras `tuning.edgesPerNode` arestas do item sob o cursor e do selecionado, e, em mid e near, marca na borda da caixa os vizinhos do item selecionado que ficam fora da tela e lista os relacionados dele (os que não estão num território esmaecido) na árvore acessível; `relatedItems(spec, id)` dá a mesma lista a um consumidor (ela indexa as arestas e os ids uma vez por objeto de especificação e reaproveita esse índice, então pedir muitos ids é barato; passe um objeto novo depois de mudar arestas ou nós, porque uma especificação alterada no lugar mantém o índice antigo). Um vizinho cuja linha nunca cruza a caixa visível não ganha marcador.
- **A identidade do território precisa estar ligada ao centroide ou ao conjunto de membros, nunca a um índice de cluster.** Clustering com a mesma entrada e outra seed devolve a mesma partição com rótulos inteiros diferentes, então um produtor que nomeia territórios pelo número do cluster os renomeia em silêncio a cada recomputação, e o mapa que o usuário aprendeu deixa de existir.

### Nomeando grupos derivados com um LLM

Sem `group` nem `parent`, um corpus de 10 a 400 territórios ganha grupos derivados da geometria, com nomes provisórios a partir do maior membro mais uma contagem ("Machine Learning +10"). `tools/group-names/` é uma ferramenta de mantenedor, fora do pacote, que pede ao Claude que nomeie esses grupos a partir dos membros e de uma amostra dos rótulos dos itens, e grava os nomes num arquivo pequeno que você commita e revisa como qualquer outro dado:

```sh
export ANTHROPIC_API_KEY=...   # ou: set -a; source ~/.config/anthropic/api.env; set +a
bun tools/group-names/main.ts corpus.json corpus.groups.json [--model claude-opus-5-5]
```

Cada nome é conferido antes de qualquer gravação (no máximo 24 caracteres, distintos, nunca "Other"); uma execução que falha não grava nada. Aplique o arquivo ao carregar o corpus com `withGroupNames(body, file)`, que grava `group` em cada território e devolve o corpo intacto quando o arquivo está velho (o corpus já não deriva exatamente esses grupos, ou um nome quebra uma regra); `staleGroups(spec, file)` lista o que mudou depois que o corpus é reexportado, para que um teste falhe com nomes velhos. As duas funções moram em `tools/group-names/` deste repositório (`groupNamesFile.ts` e `stale.ts`), não no pacote npm: copie-as, ou grave `group` direto no seu corpus. A ferramenta roda offline, uma vez, nunca no navegador: chave no navegador é chave vazada, e o mesmo corpus mostraria nomes diferentes em duas visitas.

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

`width` e `height` são opcionais. Passe os dois e o mapa se ajusta a eles imediatamente, sem `ResizeObserver`; deixe algum de fora e a raiz preenche o pai (`100%` via CSS) em vez disso, medida por um `ResizeObserver` (o hook `useElementSize`, internamente), sem pintar nada até a primeira medição chegar. Uma caixa com largura ou altura zero, venha de onde vier, conta como caixa ainda inexistente: o mapa não pinta nada e se ajusta à primeira caixa com os dois lados positivos. De qualquer forma, uma mudança de caixa posterior — uma nova medição, ou uma mudança posterior nas props `width`/`height` — mantém a escala atual e mantém o ponto do mundo que estava no centro da caixa antiga no centro da nova, em vez de reajustar e descartar o zoom do usuário. Mudar `spec` continua reajustando o viewport à nova extensão, como antes; não é preciso remontar com `key=` em nenhum dos dois casos. Para reajustar depois de uma mudança de caixa (por exemplo, quando o próprio layout do consumidor muda o espaço disponível), passe um `ref` tipado `CorpusMapHandle` e chame o `fit()` dele — o mesmo handle também expõe `zoomIn()`/`zoomOut()`, um entalhe de roda cada, presos à mesma faixa de zoom que o próprio handler de roda usa, `reveal(id)`, que centraliza a visão num item no zoom atual sem selecioná-lo, `setView(view)`, que salta para um `MapViewport` (preso à faixa de zoom; um inválido não faz nada), e `getView()`, que lê a visão desenhada agora (`undefined` até o mapa ter caixa e cena).

`onRegimeChange` dispara uma vez na montagem (uma vez também sob `<StrictMode>`) com o regime inicial (`"far"`, `"mid"` ou `"near"`; o tipo `Regime` é exportado) e de novo a cada travessia, então um consumidor pode, por exemplo, mostrar uma legenda só no regime distante. `onViewChange?: (view: CorpusMapView) => void` dispara uma vez na montagem, de novo depois de qualquer render confirmado cujo regime, razão de escala em relação à escala ajustada, ou contagem de nós na tela tenha mudado, e depois de todo reajuste (um novo `spec`, ou `fit()`) mesmo quando esses valores não mudam — no máximo uma vez por quadro de animação durante um arraste, já que arrastos já são agrupados em um commit por quadro; `CorpusMapView` é exportado.

`viewport?: MapViewport`, `defaultViewport?: MapViewport` e `onViewportChange?: (viewport, { reason }) => void` guardam a visão do mesmo jeito que `hiddenTerritories` guarda a legenda: `viewport` presente quer dizer controlado; ausente, o mapa guarda a própria, começando de `defaultViewport` só no primeiro spec. Um `MapViewport` é `{ centre: [x, y], zoom }`, o ponto do mundo no centro da caixa e a escala relativa ao ajuste (a mesma `ratio` que `onViewChange` informa), então o mesmo valor abre no mesmo regime em qualquer caixa. Controlado, uma mudança de caixa não emite nada (a visão pública sobrevive a ela); não controlado, o mapa mantém a escala em pixels, então o zoom sobre o novo ajuste muda e é emitido uma vez com `reason: "resize"`. `onViewportChange` dispara nos dois modos, uma vez por mudança real, com `reason` `"interaction"` (arraste, roda, teclas, minimapa, a árvore acessível, `zoomIn`/`zoomOut`), `"fit"` (`fit()`, a tecla `0`/`Home`, Back to overview), `"spec"` ou `"resize"`; um consumidor que devolve o que recebeu não causa segunda emissão. Controlado, a biblioteca nunca move a visão sozinha: um novo `spec` mantém a visão desenhada e propõe o ajuste dele com `reason: "spec"`, e o consumidor guarda ou ignora (para manter a visão de um link); o regime reinicia quando a visão devolvida é esse ajuste. Entrada inválida nunca quebra o mapa: `centre` ou `zoom` não finitos, ou `zoom <= 0`, desenham o ajuste, e um `zoom` fora de 1/8 a 64 é limitado. `MapViewport` e `ViewportChangeReason` são exportados.

`selectedId?: string | null`, `defaultSelectedId?: string | null` e `onSelectedChange?: (id: string | null) => void` guardam o item selecionado, controlado quando `selectedId` está presente, mesmo `null`. Pressionar ou tocar num ponto o seleciona; um toque que não acerta ponto nenhum limpa, e o Escape também, que fecha a seleção primeiro e afasta um regime no toque seguinte. `onSelectedChange` dispara só quando o id muda; `onSelect(node)` continua disparando a cada ativação, e agora dispara também ao pressionar um ponto, não só um card. O ponto selecionado ganha um anel por fora do anel de foco do teclado (token de tema `selectionRing`, com `territoryLabel` como reserva), que esmaece junto com os pontos, e o botão dele na árvore acessível leva `aria-current="true"`; um id cujo nó está esmaecido ou ausente conta como nenhuma seleção até voltar a aparecer. A navegação pelas setas anuncia cada item no momento em que o pede, então um consumidor controlado que recusa ou atrasa um pedido ouve o nome antes de o anel chegar lá (ou sem ele chegar); a próxima seta segue do último pedido até o consumidor desenhar uma seleção própria. `onOpenTerritoryChange?: (id: string | null) => void` informa o território aberto: aquele, não esmaecido, cuja forma contém o centro da caixa enquanto o regime é near (o mais interno quando se aninham), `null` caso contrário, disparado só numa mudança.

No celular, dois dedos dão zoom em pinça em torno do ponto médio e arrastam juntos, um toque duplo aproxima um passo em torno do toque, um toque com dois dedos afasta um passo, e um toque seleciona; o dedo pode escorregar até 10 px e ainda tocar (um toque no mapa vazio limpa a seleção depois que a janela do toque duplo passa, então um toque duplo nunca limpa, e só se nada mais selecionou um item nesse meio-tempo). Abaixo de uma caixa de 600 px os nomes das famílias são desenhados e ajustados em `theme.territoryFonts.compact` (padrão `"700 14px system-ui, sans-serif"`) e todo controle da legenda tem pelo menos 44 px de altura; quando os `insets` crescem sobre o item selecionado (uma folha abrindo por cima dele), a visão se move no mesmo zoom para trazê-lo de volta à área descoberta.

`spec` precisa ter referência estável: um objeto novo é um corpus novo e reajusta a vista, então construa-o uma vez (estado, `useMemo` ou uma constante de módulo), nunca inline.

`minimap?: boolean | { corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" }` (padrão desligado) adiciona um canvas de 160x110 num canto da caixa, pintando os contornos de território e a visão atual como um retângulo; pressionar ou arrastar nele centraliza a visão principal no ponto do mundo pressionado, através da mesma atualização agrupada que dispara `onViewChange` e que um arraste no próprio mapa usa. `true` escolhe o canto padrão, `"bottom-left"`; `MinimapCorner` é exportado para a forma de objeto.

Cards são decorativos. O overlay em que vivem é `aria-hidden` e `inert`, então nada dentro de um card é focável, entra na ordem de tabulação ou é clicável por conta própria — um clique solto sobre um card dispara `onSelect` com aquele nó, e essa é toda a superfície de interação de um card. Conteúdo interativo pertence à UI do próprio consumidor, guiada por `onSelect`.

`theme` reestiliza o campo de pontos e os contornos de território, e o contorno de foco do teclado (`focusOutline`, `focusOutlineWidth`: a árvore acessível é visualmente oculta, então o território ou item cujo botão tem o foco ganha um contorno no canvas; o azul padrão chega a pelo menos 3:1 contra uma página branca ou cinza-clara, WCAG 2.2 SC 1.4.11); tanto o tipo `Theme` quanto o `DEFAULT_THEME` da biblioteca são exportados por `corpus-map`, então um consumidor pode tipar um tema próprio ou partir do padrão e sobrescrever campos individuais.

`thresholds.midAt` e `thresholds.nearAt` são múltiplos da escala ajustada — o zoom no qual o corpus inteiro cabe na caixa — e não valores de escala absolutos, então `DEFAULT_THRESHOLDS = { midAt: 2, nearAt: 5 }` abre todo corpus no regime distante, qualquer que seja sua própria extensão, e alcançar o regime médio ou próximo a partir daí exige só um zoom de 2x ou 5x.

`tuning?: Partial<Tuning>` sobrescreve qualquer um dos números que a literatura não resolve, sem tocar em código — sensibilidade da roda, ganho do pinça do trackpad, o teto de zoom por evento, a histerese e a faixa de crossfade do nível de detalhe, o padding do contorno de território, os cortes de tamanho de rótulo, o raio de hover. `Tuning` e `DEFAULT_TUNING` são exportados, então um consumidor (ou um painel de ajuste) pode partir dos padrões e sobrescrever campos individuais do mesmo jeito que `theme`.

No regime próximo os itens mais relevantes ganham um rótulo compacto, pintado no canvas como uma dica aberta ao lado do ponto: um `MapNode.priority` maior (finito, ausente conta como 0) é rotulado primeiro, depois o item com mais arestas, depois o id menor. O texto quebra em `tuning.itemLabelWidth` pixels de tela (padrão 160) em no máximo `tuning.itemLabelLines` linhas (padrão 3), a última terminando em reticências quando o rótulo é mais longo, na fonte `theme.itemLabelFont` (padrão `DEFAULT_ITEM_LABEL_FONT`, `"500 11px system-ui, sans-serif"`; o tamanho em px, pt, em ou rem, com em e rem valendo 16px). Os rótulos são posicionados uma vez por spec, depois dos nomes de território, então um rótulo nunca cobre um nome nem outro rótulo, o conjunto mostrado depende só do zoom, e um arraste nunca faz um surgir ou sumir; os rótulos aparecem gradualmente na faixa de crossfade do limiar próximo. Pressionar um rótulo seleciona o item dele, como pressionar o ponto. Com famílias, os regimes médio e próximo desenham folhas só da família que domina a tela: cada família recebe um peso a partir da sua parcela dos itens na tela da maior família (`tuning.focusFloor`, padrão 0,5, e abaixo dele a família é desenhada como família; `tuning.focusFull`, padrão 1, e a partir dele todas as suas folhas), subindo suavemente entre os dois, então nada surge de repente num arraste. Nos regimes médio e próximo, passar o mouse sobre o ponto mais próximo dentro de `tuning.hoverRadius` pixels de tela mostra o nome dele numa pequena dica, a menos que o rótulo desse ponto esteja desenhado onde se vê (no canvas e fora do card selecionado).

Só o item selecionado ganha um card, nos regimes médio e próximo enquanto o ponto dele está dentro da caixa e fora de um lado de `insets`; o card aparece e some gradualmente junto com os pontos. `cardSize?: { width: number; height: number }` (padrão `{ width: 160, height: 56 }`) define o quadro que a biblioteca desenha ao redor dele; `renderCard(node)` só preenche o conteúdo. O card fica ao lado do ponto selecionado, naquela entre oito posições junto dele, ou oito mais afastadas, que esconde menos arestas desenhadas do item e menos outros pontos dentro da caixa (`placeSelectedCard` é exportado para um consumidor que monte o próprio overlay); um card no anel externo se liga ao ponto por uma linha-guia curta.

`cardSizeFor(spec, options?)` devolve um `cardSize` ajustado aos rótulos do próprio corpus, para os cards não desperdiçarem espaço com títulos curtos nem cortarem os longos: pega a largura de rótulo em que nove títulos em dez cabem (`percentile`, padrão 0,9), divide em `titleLines` (padrão 2), limita o quadro a `[minimumWidth, maximumWidth]` (padrão 120–240 px, com o padding e as bordas do card) e dá à altura essas linhas mais `extraLines` (um ano, um subtítulo); os dois lados contam o quadro do card da biblioteca (uma faixa de 4 px e uma borda de 1 px na largura, 1 px em cima e embaixo), então a caixa em que o `renderCard` desenha é a coluna de texto com o padding. Passe o `font`, o `lineHeight` e o `padding` que o seu renderizador de card de fato usa (padrões `"16px sans-serif"`, 1,25, 8) e limite o título no renderizador a `titleLines` para o rótulo em dez que for mais longo; `measure` troca a estimativa da biblioteca (0,6 em por caractere) por uma medição real. Opções inválidas lançam um `RangeError` com o nome da opção, entre elas um `padding` que não deixa coluna de texto em `maximumWidth`. Se o card mostra outro texto que não `node.label` (o nome do elemento em vez do símbolo, por exemplo), meça a partir de um spec cujos rótulos sejam esse texto: `cardSizeFor({ ...spec, nodes: spec.nodes.map((node) => ({ ...node, label: titleOf(node) })) })`.

`matches?: ReadonlySet<string> | readonly string[] | null` marca os itens que uma busca achou: `undefined` ou `null` significa que nenhuma busca está ativa, um conjunto vazio esmaece tudo e, nos demais casos, os outros itens ficam esmaecidos e os achados ganham um anel, compondo com `hiddenTerritories` (um território esmaecido continua esmaecido). O mapa nunca se move sozinho quando `matches` muda; `revealAll(ids)` no `CorpusMapHandle` ajusta a visão em volta dos achados ainda no mapa, dentro de `insets`, com a escala limitada à faixa de zoom do mapa (um único achado é centralizado o mais perto que essa faixa permite). Os rótulos dos itens e a árvore acessível seguem os achados, e os botões da árvore levam `aria-description="match"`, então quem usa teclado ou leitor de tela lê o mesmo resultado.

`corpus-map/search` é uma entrada separada (arquivo próprio, cerca de 2 kB gzip, então quem usa só o mapa não paga nada) com o `SearchBox`: `<SearchBox spec={spec} onMatches={setMatches} onShow={() => handle.current?.revealAll(matches ?? [])} />`. Ele espera o fim da digitação, roda no navegador uma busca local que ignora acento e caixa sobre o rótulo e o `meta` de cada item, a menos que você passe `search: (query) => ids | Promise<ids>` (um servidor, um worker, um índice vetorial), guarda só a resposta mais nova, anuncia a contagem em `role="status"` ("12 results", "No results", "Search failed"), limpa com Escape, com o botão de limpar ou com um `spec` novo, e mostra o botão "Show on map" quando `onShow` é dado. Os estilos inline herdam a cor e a fonte da página; `touchTargets` dá a cada controle um alvo de 44 px.

### Diálogo com uma IA

`corpus-map/assistant` é uma terceira entrada separada com o `AssistantBox`, uma caixa de diálogo enxuta: `<AssistantBox spec={spec} ask={ask} selectedId={selectedId} view={view} onMatches={setMatches} onReveal={(ids) => handle.current?.revealAll(ids)} onRestore={(view) => handle.current?.setView(view)} onSelect={select} />`. A IA é sua: `ask(request, signal)` recebe `{ question, selectedId, history }` e devolve uma promessa de `{ text, ids }` inteiro (sem streaming, sem chave nem servidor na biblioteca). Ids citados que o `spec` não conhece são descartados. Quando uma resposta cita itens, eles são destacados por `onMatches` e enquadrados uma vez por `onReveal`, mas só se o `view` que você passa ainda for o que a pessoa tinha ao perguntar, e então um botão "Back to previous view" chama `onRestore` com essa vista; quem moveu o mapa nesse meio-tempo nunca é deslocado. `view` é o que o `onViewportChange` informou (ou `handle.getView()` para o primeiro enquadramento, que nunca é informado). Uma pergunta nova aborta a anterior, um `spec` novo limpa o diálogo, e um `ask` rejeitado mostra "Assistant failed". Passe `notice` para dizer na tela que as respostas não são de uma IA, como a demo faz.

### Filtro por atributo

`corpus-map/filter` é uma quarta entrada separada (arquivo próprio, cerca de 2 kB gzipados; quem usa só o mapa não paga nada) com o `FilterBox`, um filtro de caixas de seleção sobre qualquer atributo de `meta`: defina o atributo uma vez, fora do seu componente, `const kind: FilterAttribute = (node) => (node.meta as { kind?: string } | undefined)?.kind;` (`meta` é `unknown`, então você o restringe), e renderize `<FilterBox spec={spec} attribute={kind} onMatches={setFilterMatches} />`. `attribute` devolve um valor, uma lista de valores ou `{ value, label }` (uma string solta vale pelos dois) e precisa ser uma referência estável: uma seta escrita direto no render é uma função nova a cada vez, e as facetas são calculadas de novo. A caixa lista cada valor com a contagem de itens, vários ao mesmo tempo (basta um para passar), e informa por `onMatches` os ids que passam, ou `null` enquanto nada está marcado; entregue isso ao `matches` do `CorpusMap` e o que ficou de fora é escurecido, nunca removido. Para combinar com uma busca ou com a resposta do assistente, passe `intersectMatches(idsDaBusca, idsDoFiltro)` (`null` é "sem restrição"). Um `spec` novo limpa a seleção. `facetsOf(spec, attribute)` e `idsMatching(spec, attribute, selected)` são as peças puras, para uma interface sua.

### Teclado e leitores de tela

- Tab chega à superfície do mapa, uma região nomeada (`label`, padrão "Map of N items"). Com o foco nela, as setas deslocam um décimo da caixa (Shift: metade), `+`/`=` e `-` dão zoom, `0` ou `Home` enquadra o corpus inteiro, e `Esc` afasta um nível de detalhe. Quando as teclas param, o número de itens na tela é anunciado uma vez.
- `Enter` ou `Espaço` sem nada selecionado seleciona o item mais perto do centro do mapa, aproximando antes até o nível próximo quando os pontos não estão desenhados. Com um item selecionado, as setas andam até o item mais próximo naquela direção em vez de deslocar o mapa, e cada passo fala o nome e o território do item ("No item to the right" numa borda); `Shift` + setas deslocam um décimo da caixa, a visão acompanha só quando o item chega perto da borda da área descoberta, e `Esc` limpa a seleção, devolvendo às setas o deslocamento.
- Com o foco no mapa, ele também captura `Ctrl`/`Cmd` + `+`/`-` como zoom do mapa, então quem depende do zoom do navegador tira o foco do mapa antes.
- O canvas é decorativo; o conteúdo é uma árvore acessível visualmente oculta logo depois da superfície. De longe ela lista os territórios sob os cabeçalhos dos seus grupos e depois "Unassigned" (os itens sem território); dentro de um território ela começa com "Back to overview" e segue com os itens na tela sob o cabeçalho do seu território. O foco nunca cai para a página quando a árvore muda por baixo dele. Os cabeçalhos de grupo da legenda também são headings.
- `headingLevel` (2–6, padrão 3) define o nível de todo heading que o mapa renderiza; escolha o que encaixa no esquema da sua página. O `focus()` do handle da ref leva o foco para a superfície do mapa.

## A demo

Rode `npm run dev` para abrir a demo — uma vitrine em tela cheia, não um preview de componente: o mapa preenche a janela do navegador (`CorpusMap` sem `width`/`height`, preenchendo o pai), uma barra superior escolhe o corpus, um minimapa e um indicador no canto inferior esquerdo (`regime · razão× · N itens`, lido direto de `onViewChange`) ficam acima dele, controles de zoom no canto inferior direito acionam o `CorpusMapHandle` do próprio mapa ("Zoom in", "Zoom out", "Fit"), e um rodapé mostra um aviso de fonte de dados para os corpora que precisam de um. Selecionar um nó abre uma gaveta com o rótulo e o território dele — para o arXiv, também o ano de publicação, a categoria do arXiv e um link para a página de resumo do paper; todo outro corpus recebe uma lista genérica de campos a partir do `meta`. Quando o item tem arestas (o arXiv traz papers semelhantes entre duas categorias), a gaveta lista esses itens em Related, cada um com as palavras de título que os dois compartilham, e pressionar um seleciona e revela o item. O hash da URL carrega o corpus, a visão e a seleção (`#corpus=arxiv&view=x,y,zoom&selected=id`, escrito por um `replaceState` com debounce), então um link reabre onde foi salvo; "Copy link" na barra superior o copia. "Ask AI" abre o painel de diálogo, recolhido até ser pressionado; as respostas vêm da busca local e dizem isso num aviso (não são de uma IA).

A galeria vem com quatro corpora, arXiv primeiro e selecionado por padrão: "Computer-science papers (arXiv metadata)" (do mundo real, ~8.000 papers, buscado sob demanda de `demo/corpora/arxiv.json`, que a build publica como asset próprio, para que seus ~1,5 MB nunca bloqueiem a primeira pintura do shell e uma falha de carga possa ser tentada de novo sem recarregar a página; o rodapé credita ao pé da letra, "Thank you to arXiv for use of its open access interoperability."; construído pelo pacote separado em [pipeline/arxiv/](pipeline/arxiv/README.pt.md); os territórios dele são os clusters do próprio mapa, 18 tópicos nomeados em 5 famílias, nomeados pelo Claude e conferidos por um teste cego, com a categoria do arXiv de cada paper no card e na gaveta), "Chemical elements", "Constellations" (estrelas brilhantes agrupadas por constelação), e "Synthetic (5,000 items)" (o número no rótulo acompanha o controle de tamanho do painel de tuning; rodapé: "Synthetic corpus, generated for scale testing.") — deliberadamente nenhum é comida: uma especificação de mapa validada por um único domínio seria uma abstração não verificada, e esses quatro são suficientemente distintos entre si para mostrar que a especificação e o ponto de extensão `renderCard` são de fato agnósticos de domínio.

Pressione `t` (ignorado enquanto se digita num campo, ou com Ctrl/Cmd/Alt pressionado) para abrir um painel de ajuste oculto: um controle deslizante por campo de `Tuning`, os dois limiares de LOD, o tamanho do quadro do card, e — para o corpus sintético — seu tamanho e sua seed, cada valor validado pelas próprias `resolveTuning`/`resolveThresholds` exportadas da biblioteca antes de chegar ao mapa, com a mensagem do `RangeError` lançado mostrada inline numa combinação inválida. O mesmo painel guarda uma captura de eventos de roda: um listener passivo e somente leitura no container do mapa, registrando os últimos 50 eventos de roda (`deltaY`, `deltaMode`, `ctrlKey`, milissegundos desde o anterior) com um botão "Copy" — para ler o que um trackpad ou mouse realmente envia, de modo que os padrões de ajuste da biblioteca (tirados do d3-zoom e do MapLibre, ver `src/shared/tuning.ts`) possam ser conferidos contra dispositivos reais. O painel e a gaveta do item selecionado dividem o mesmo espaço à direita e são mutuamente exclusivos (abrir um fecha o outro), e os controles de zoom se deslocam para a esquerda para ficar livres de qualquer um dos dois que esteja aberto sempre que há espaço, ou são cobertos por ele — reversivelmente, um toque ou Escape — em telas mais estreitas.

Em desenvolvimento a demo consome a biblioteca por um alias do Vite para `src/`, não pelo pacote construído; o que prova que o pacote construído é utilizável é o CI, que roda `npm run build` e confere que o `dist/index.d.ts` emitido existe onde o `package.json` diz.

## Garantias

- **Baseline em Canvas 2D, sem exigir WebGPU.** O campo de pontos é renderizado em Canvas 2D; nada nesta biblioteca exige WebGPU ou WebGL para funcionar.
- **Alcançável por teclado e leitor de tela, e auditado.** Cada nível de zoom é espelhado por uma árvore acessível visualmente oculta e sempre presente, com uma live region anunciando o regime atual: territórios sob os cabeçalhos dos seus grupos e um controle "Unassigned" nos regimes distante e médio, "Back to overview" e os itens na tela, limitados pelo cap, no regime próximo. A superfície do mapa com foco desloca, dá zoom, enquadra, afasta e anda de item em item vizinho pelo teclado, então quem lê consegue abrir um território, sair dele e abrir outro; um teste percorre exatamente isso. O território ou item com o foco ganha um contorno no canvas. Uma auditoria axe, com canário de defeitos injetados, roda sobre os estados do mapa e a demo na suíte; o contraste é conferido num navegador com o Lighthouse; a experiência falada ainda não foi conferida com um leitor de tela de verdade (veja [Teclado e leitores de tela](#teclado-e-leitores-de-tela)).

## Performance

O benchmark em `bench/field.test.ts` (rodado via `npm run bench`) mede apenas o custo de CPU da função `paint` escrevendo em uma `RecordingSurface` em memória, não a rasterização real de um `<canvas>` no navegador — é um gate de regressão sobre a lógica própria do pintor, não uma alegação sobre taxa de quadros no mundo real. Nenhuma taxa de quadros por segundo medida em navegador é alegada ainda.

## Créditos

Veja [CREDITS.md](CREDITS.md) para as referências que inspiraram esta biblioteca, e as restrições de licenciamento que foram respeitadas ao fazer isso.

Este projeto é licenciado sob a [Licença MIT](LICENSE).
