# storya-feed

Transforma o feed do seu Substack em um `feed.json` que o Storya lê. O GitHub Pages hospeda o arquivo
(e libera o acesso, que o Substack bloqueia por CORS).

O que o `gerar-feed.mjs` faz a cada rodada:

- baixa o RSS do Substack;
- escolhe a imagem de cada texto (ignora o logo da publicação e imagens genéricas);
- **confere se o link de cada texto ainda existe**: texto apagado ou despublicado no Substack sai do `feed.json`
  na rodada seguinte, mesmo que o RSS do Substack ainda o entregue por causa do cache;
- só grava (e só gera commit) se algo mudou;
- se não conseguir baixar o feed, **não mexe** no `feed.json` atual e a execução fica vermelha na aba Actions.

## Passo a passo (uma vez só)

1. No GitHub, crie um repositório **público** chamado `storya-feed` e suba estes arquivos, mantendo as pastas
   `docs/` e `.github/workflows/`. A pasta `.github` começa com ponto e costuma ficar escondida: se ela não subir,
   use **Add file › Create new file**, digite `.github/workflows/atualizar-feed.yml` como nome e cole o conteúdo do arquivo.
2. **Settings › Pages**: em *Source* escolha *Deploy from a branch*, branch `main`, pasta `/docs`. Salve.
3. **Actions › Atualizar feed › Run workflow**. Ele grava `docs/feed.json` e depois roda sozinho a cada 30 minutos.
4. Seu endereço será `https://SEU-USUARIO.github.io/storya-feed/feed.json`. Abra no navegador para conferir:
   deve aparecer o JSON com os seus textos.
5. Esse endereço é o que o Storya lê. **Escolha com cuidado e não mude depois** (nome de usuário ou de repositório
   fazem parte dele).

## Se deu erro

- **Não aparece "Atualizar feed" na aba Actions.** A pasta `.github/workflows` não subiu (veja o passo 1).
- **A execução ficou vermelha.** Abra-a e leia a mensagem. Se for `Não consegui baixar o feed (status 403)`, o Substack
  recusou o acesso vindo do GitHub; me mande a mensagem.
- **Falha ao enviar (push) com erro de permissão.** Em *Settings › Actions › General › Workflow permissions*
  escolha *Read and write permissions*.
- **O endereço `.github.io/...` dá "404".** O Pages ainda não foi ativado (passo 2) ou a pasta não é `/docs`.
  Depois de ativar, leva alguns minutos para entrar no ar.
- **Apaguei um texto e ele continua.** Rode **Run workflow** e espere um ou dois minutos. O GitHub Pages também guarda
  o arquivo em cache por alguns minutos.

## Observações

- Posts pagos aparecem só com a prévia que o Substack coloca no feed.
- Para testar no seu computador: `node gerar-feed.mjs` (Node 18+). `VERIFICAR_LINKS=0` pula a conferência dos links.
- O GitHub pausa agendamentos de repositórios parados por 60 dias. Se ficar muito tempo sem mudanças, clique em
  *Run workflow* de novo.
- Se um dia o Substack mudar o endereço do feed, ajuste `SUBSTACK_FEED` em `gerar-feed.mjs`.
