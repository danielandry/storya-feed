// Gera docs/feed.json (o arquivo que o Storya lê) a partir do Substack.
// Tenta 1) o feed RSS e, se for bloqueado (403), 2) a lista de posts em JSON do próprio Substack.
// Node 18+ (sem dependências). Uso local: node gerar-feed.mjs
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const FEED = process.env.SUBSTACK_FEED || 'https://storyastudio.substack.com/feed';
const BASE = new URL(FEED).origin;
const OUT = process.env.OUT || 'docs/feed.json';
const MAX = 30;
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
};

const ent = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
const dec = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
  return ent[e.toLowerCase()] ?? m;
});
const unwrap = s => { const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s); return m ? m[1] : dec(s); };
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? unwrap(m[1]).trim() : ''; };
const texto = html => dec(String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';

/* ---- fonte 1: RSS ---- */
function doRss(xml) {
  const canal = xml.split(/<item[\s>]/i)[0];
  const itens = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, MAX).map(m => {
    const x = m[1];
    const html = tag(x, 'content:encoded');
    const enc = /<enclosure[^>]*\surl="([^"]+)"/i.exec(x);
    const img = enc ? dec(enc[1]) : (/<img[^>]*\ssrc="([^"]+)"/i.exec(html) || [])[1] || '';
    const d = new Date(tag(x, 'pubDate'));
    const sub = texto(tag(x, 'description'));
    return { id: tag(x, 'guid') || tag(x, 'link'), titulo: texto(tag(x, 'title')), subtitulo: corta(sub, 240),
      resumo: corta(texto(html) || sub, 300), data: isNaN(d) ? '' : d.toISOString(), autor: texto(tag(x, 'dc:creator')),
      url: tag(x, 'link'), imagem: img ? dec(img) : '' };
  }).filter(i => i.titulo);
  return { titulo: texto(tag(canal, 'title')) || 'Newsletter', itens };
}

/* ---- fonte 2: lista de posts em JSON (/api/v1/archive) ---- */
function doJson(arr) {
  const itens = arr.slice(0, MAX).map(p => {
    const d = new Date(p.post_date);
    return { id: String(p.id ?? p.slug ?? ''), titulo: texto(p.title), subtitulo: corta(texto(p.subtitle), 240),
      resumo: corta(texto(p.description || p.subtitle), 300), data: isNaN(d) ? '' : d.toISOString(),
      autor: texto(p.publishedBylines && p.publishedBylines[0] && p.publishedBylines[0].name),
      url: p.canonical_url || (p.slug ? `${BASE}/p/${p.slug}` : ''), imagem: p.cover_image || '' };
  }).filter(i => i.titulo);
  return { titulo: 'Newsletter', itens };
}

async function baixa(url, accept) {
  const r = await fetch(url, { headers: { ...HEADERS, accept } });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.text();
}
const lerConteudo = c => c.trim().startsWith('[') ? doJson(JSON.parse(c)) : doRss(c);

let res;
if (process.env.FEED_FILE) {
  res = lerConteudo(await readFile(process.env.FEED_FILE, 'utf8'));
} else {
  const erros = [];
  for (const [url, accept] of [[FEED, 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'],
                               [`${BASE}/api/v1/archive?sort=new&search=&offset=0&limit=${MAX}`, 'application/json']]) {
    try { res = lerConteudo(await baixa(url, accept)); console.log(`Fonte usada: ${url}`); break; }
    catch (e) { erros.push(e.message); console.warn('Falhou:', e.message); }
  }
  if (!res) { console.error('Nenhuma fonte respondeu:\n- ' + erros.join('\n- ')); process.exit(1); }
}

const saida = { titulo: res.titulo, atualizado: new Date().toISOString(), itens: res.itens };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(saida, null, 2) + '\n');
console.log(`${res.itens.length} texto(s) gravado(s) em ${OUT}`);
