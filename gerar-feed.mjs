// Converte o RSS do Substack em docs/feed.json (o arquivo que o Storya lê).
// Node 18+ (sem dependências). Uso local: node gerar-feed.mjs
//  - escolhe a imagem do post (ignora o logo da publicação e imagens genéricas);
//  - confere se o link de cada texto ainda existe: texto apagado/despublicado no Substack sai do feed na hora,
//    mesmo que o RSS do Substack ainda o entregue (cache);
//  - se não conseguir baixar o feed, NÃO mexe no feed.json atual (o erro aparece em vermelho na aba Actions).
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const FEED = process.env.SUBSTACK_FEED || 'https://storyastudio.substack.com/feed';
const OUT = process.env.OUT || 'docs/feed.json';
const MAX = 30;
const VERIFICAR = process.env.VERIFICAR_LINKS !== '0';
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'storya-feed/1.0'
];

const ent = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ' };
const dec = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
  return ent[e.toLowerCase()] ?? m;
});
const unwrap = s => { const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s); return m ? m[1] : dec(s); };
const tag = (xml, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? unwrap(m[1]).trim() : ''; };
const texto = html => dec(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const corta = (s, n) => s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';


/* ---------- download (tenta com mais de uma identificação) ---------- */
async function baixa(url) {
  let ultimo = '';
  for (const ua of UAS) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': ua, accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      if (r.ok) return await r.text();
      ultimo = 'status ' + r.status;
    } catch (e) { ultimo = e.message; }
  }
  throw new Error(`Não consegui baixar o feed (${ultimo}): ${url}`);
}
const xml = process.env.FEED_FILE ? await readFile(process.env.FEED_FILE, 'utf8') : await baixa(FEED);

/* ---------- escolha da imagem do post ---------- */
const decUrl = s => { try { return decodeURIComponent(s); } catch { return s; } };
const imgKey = v => { const s = decUrl(String(v || '')); const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); return m ? m[0].toLowerCase() : s.replace(/^https?:\/\//, '').split('?')[0]; };
const ratioOf = v => { const m = decUrl(String(v || '')).match(/_(\d{2,5})x(\d{2,5})\.(?:png|jpe?g|webp|gif|avif)/i); return m ? (+m[1]) / (+m[2]) : 0; };
const quadrada = v => { const r = ratioOf(v); return r > 0.8 && r < 1.25; };                  // cara de logo
const postImg = v => /\/public\/images\/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(decUrl(String(v || '')));  // enviada pelo autor
const nota = v => (postImg(v) ? 2 : 0) + (quadrada(v) ? -1 : 1);
const absUrl = v => { v = String(v || '').trim(); return v.startsWith('//') ? 'https:' + v : v; };
const ruim = (src, w, h) => /twemoji|emoji|avatar|favicon|\/icons?\/|1x1|pixel/i.test(src) || (w > 0 && w < 150) || (h > 0 && h < 150);
const attr = (t, n) => { const m = new RegExp('\\s' + n + '="([^"]*)"', 'i').exec(t); return m ? dec(m[1]) : ''; };
function imgsDoTexto(html) {
  return [...html.matchAll(/<img\b[^>]*>/gi)].map(m => {
    const t = m[0];
    const src = attr(t, 'src') || attr(t, 'data-src') || attr(t, 'srcset').split(',')[0].trim().split(/\s+/)[0];
    return src && !ruim(src, parseInt(attr(t, 'width'), 10) || 0, parseInt(attr(t, 'height'), 10) || 0) ? absUrl(src) : '';
  }).filter(Boolean);
}

const canal = xml.split(/<item[\s>]/i)[0];
const logos = new Set();                                          // o logo da publicação nunca vale como capa de post
for (const m of canal.matchAll(/<image\b[^>]*>([\s\S]*?)<\/image>/gi)) { const u = tag(m[0], 'url'); if (u) logos.add(imgKey(u)); }
for (const m of canal.matchAll(/<itunes:image\b[^>]*\shref="([^"]+)"/gi)) logos.add(imgKey(dec(m[1])));

const brutos = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, MAX).map(m => {
  const x = m[1];
  const html = tag(x, 'content:encoded');
  const enc = /<enclosure[^>]*\surl="([^"]+)"/i.exec(x);
  const media = [...x.matchAll(/<media:(?:content|thumbnail)\b[^>]*\surl="([^"]+)"/gi)].map(k => dec(k[1]));
  const doTexto = imgsDoTexto(html).map(absUrl);
  const cands = [enc && dec(enc[1]), ...media, ...doTexto].filter(Boolean).map(absUrl);
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
    cands, doTexto
  };
}).filter(i => i.titulo);

// imagem do enclosure que aparece em quase todos os posts é a de reserva do Substack, não a capa (a que o autor põe no texto vale sempre)
const uso = new Map();
brutos.forEach(i => new Set(i.cands.map(imgKey)).forEach(k => uso.set(k, (uso.get(k) || 0) + 1)));
const generica = k => brutos.length >= 3 && (uso.get(k) || 0) >= Math.max(3, Math.ceil(brutos.length * 0.6));

let itens = brutos.map(({ cands, doTexto, ...resto }) => {
  // quadrada vinda do enclosure/media é quase sempre o logo; quadrada que o autor pôs no texto é de propósito
  const ok = cands.filter(s => !logos.has(imgKey(s)) && !(generica(imgKey(s)) && !doTexto.includes(s)) && !ruim(s, 0, 0) && !(quadrada(s) && !doTexto.includes(s)));
  let imagem = '', melhor = -9;
  for (const s of ok) { const n = nota(s); if (n > melhor) { melhor = n; imagem = s; } }
  return { ...resto, imagem };
});

/* ---------- texto apagado no Substack: o link deixou de existir? ---------- */
async function removido(url) {
  let origem; try { origem = new URL(url); } catch { return false; }
  for (const metodo of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method: metodo, headers: { 'user-agent': UAS[0] }, redirect: 'follow' });
      try { await r.body?.cancel(); } catch {}
      if (r.status === 404 || r.status === 410) return true;
      if (r.ok) {
        const fim = new URL(r.url);   // mandou para outra página que não é um texto (ex.: a home)? então o texto não existe mais
        return r.redirected && fim.pathname.replace(/\/+$/, '') !== origem.pathname.replace(/\/+$/, '') && !/^\/p\//.test(fim.pathname);
      }
      // 403/429/5xx: não dá para saber; na dúvida o texto fica (melhor sobrar um do que sumir por engano)
    } catch { /* sem rede para esse link: idem */ }
  }
  return false;
}
if (VERIFICAR) {
  const mortos = await Promise.all(itens.map(i => removido(i.url)));
  itens.forEach((i, k) => { if (mortos[k]) console.log(`Removido do feed (o link não existe mais): ${i.titulo}`); });
  itens = itens.filter((_, k) => !mortos[k]);
}

/* ---------- grava só se algo mudou (evita commits à toa) ---------- */
const titulo = texto(tag(canal, 'title')) || 'Newsletter';
let anterior = null; try { anterior = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
if (anterior && anterior.titulo === titulo && JSON.stringify(anterior.itens) === JSON.stringify(itens)) {
  console.log(`Sem mudanças: ${itens.length} texto(s).`);
} else {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ titulo, atualizado: new Date().toISOString(), itens }, null, 2) + '\n');
  console.log(`${itens.length} texto(s) gravado(s) em ${OUT}`);
}
