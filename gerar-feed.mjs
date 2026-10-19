// Converte o RSS do Substack em docs/feed.json (o arquivo que o Storya lê).
// Node 18+ (sem dependências). Uso local: node gerar-feed.mjs
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const FEED = process.env.SUBSTACK_FEED || 'https://storyastudio.substack.com/feed';
const OUT = process.env.OUT || 'docs/feed.json';
const MAX = 30;

const ent = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
const dec = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
  return ent[e.toLowerCase()] ?? m;
});
const unwrap = s => { const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s); return m ? m[1] : dec(s); };
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? unwrap(m[1]).trim() : ''; };
const texto = html => dec(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';

const xml = process.env.FEED_FILE ? await readFile(process.env.FEED_FILE, 'utf8') : await (async () => {
  const r = await fetch(FEED, { headers: { 'user-agent': 'storya-feed/1.0' } });
  if (!r.ok) throw new Error(`Feed respondeu ${r.status}`);
  return r.text();
})();

const canal = xml.split(/<item[\s>]/i)[0];
const itens = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, MAX).map(m => {
  const x = m[1];
  const html = tag(x, 'content:encoded');
  const enc = /<enclosure[^>]*\surl="([^"]+)"/i.exec(x);
  const img = enc ? dec(enc[1]) : (/<img[^>]*\ssrc="([^"]+)"/i.exec(html) || [])[1] || '';
  const d = new Date(tag(x, 'pubDate'));
  const sub = texto(tag(x, 'description'));
  return {
    id: tag(x, 'guid') || tag(x, 'link'),
    titulo: texto(tag(x, 'title')),
    subtitulo: corta(sub, 240),
    resumo: corta(texto(html) || sub, 300),
    data: isNaN(d) ? '' : d.toISOString(),
    autor: texto(tag(x, 'dc:creator')),
    url: tag(x, 'link'),
    imagem: img ? dec(img) : ''
  };
}).filter(i => i.titulo);

const saida = { titulo: texto(tag(canal, 'title')) || 'Newsletter', atualizado: new Date().toISOString(), itens };
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(saida, null, 2) + '\n');
console.log(`${itens.length} texto(s) gravado(s) em ${OUT}`);
