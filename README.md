# storya-feed

Pequeno repositório que transforma o feed do seu Substack em um `feed.json` que o Storya consegue ler
(o navegador/app não consegue ler o feed do Substack direto por causa do CORS; o GitHub Pages libera isso).

## Passo a passo (uma vez só)

1. No GitHub, crie um repositório **público** chamado `storya-feed` e suba estes arquivos (mantendo as pastas `docs/` e `.github/workflows/`).
2. **Settings › Pages**: em *Source* escolha *Deploy from a branch*, branch `main`, pasta `/docs`. Salve.
3. **Actions › Atualizar feed › Run workflow**. Ele baixa o feed do Substack e grava `docs/feed.json`. Depois disso roda sozinho a cada 3 horas.
4. Seu endereço será `https://SEU-USUARIO.github.io/storya-feed/feed.json` (abra no navegador para conferir).
5. No Storya, abra `js/72-newsletter.js` e cole esse endereço em `CFG.feedUrl`.

## Observações

- Posts pagos aparecem só com a prévia que o Substack coloca no feed.
- Para testar no seu computador: `node gerar-feed.mjs` (precisa do Node 18+). Gera `docs/feed.json`.
- O GitHub pausa agendamentos de repositórios parados por 60 dias. Como o feed só muda quando você publica, se ficar muito tempo sem postar, é só clicar em *Run workflow* de novo.
- Se um dia o Substack mudar o endereço do feed, ajuste `SUBSTACK_FEED` em `gerar-feed.mjs`.
