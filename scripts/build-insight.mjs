// content/insight/*.md → insight/ (목록 + 글 페이지), sitemap.xml, llms.txt 갱신
// 사용: npm run build:insight   (status 가 "발행"으로 시작하는 글만 생성)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://cmdlab.kr';
const GA_ID = 'G-6N6XNN7GBT';
const SRC_DIR = path.join(ROOT, 'content/insight');
const OUT_DIR = path.join(ROOT, 'insight');
const IMG_URL = (slug) => `/assets/images/insight/${slug}`;
const PLACEHOLDER = /\[대표님?\s*작성|\[작성\s*필요|\[TODO/;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const dotDate = (iso) => iso.replace(/-/g, '.');

function webpSize(file) {
  const b = fs.readFileSync(file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error(`webp 형식을 읽을 수 없음: ${file}`);
}

function loadPosts() {
  if (!fs.existsSync(SRC_DIR)) return [];
  const posts = [];
  for (const f of fs.readdirSync(SRC_DIR).filter((n) => n.endsWith('.md')).sort()) {
    const { data, content } = matter(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
    if (!String(data.status || '').startsWith('발행')) { console.log(`- 건너뜀(${data.status || '상태 없음'}): ${f}`); continue; }
    for (const k of ['title', 'seo_title', 'description', 'slug', 'date']) if (!data[k]) fail(`${f}: front matter "${k}" 없음`);
    if (PLACEHOLDER.test(content)) fail(`${f}: 미작성 표시("[대표님 작성 …]" 등)가 남아 있어 발행할 수 없습니다.`);
    const slug = String(data.slug).split('/').filter(Boolean).pop();
    posts.push({ ...data, slug, date: isoDate(data.date), modified: data.modified ? isoDate(data.modified) : isoDate(data.date), body: content, file: f });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

function renderBody(post) {
  const imgDir = path.join(ROOT, 'assets/images/insight', post.slug);
  const renderer = new marked.Renderer();
  renderer.image = ({ href, text }) => {
    const m = href.match(/^(?:\.\/)?images\/(.+)\.(?:png|jpe?g|webp)$/i);
    if (!m) fail(`${post.file}: 지원하지 않는 이미지 경로 ${href}`);
    const file = path.join(imgDir, `${m[1]}.webp`);
    if (!fs.existsSync(file)) fail(`${post.file}: 이미지 없음 ${path.relative(ROOT, file)} (scripts/img2webp.sh 로 변환)`);
    const { w, h } = webpSize(file);
    return `<img src="${IMG_URL(post.slug)}/${m[1]}.webp" alt="${esc(text)}" width="${w}" height="${h}" loading="lazy">`;
  };
  const md = (s) => marked.parse(s, { renderer, gfm: true });

  let body = post.body.replace(/^\s*# .*\n/, '');
  let sources = '';
  const si = body.search(/\n-{3,}\s*\n\s*\*\*출처\*\*/);
  if (si >= 0) { sources = body.slice(si).replace(/^\s*-{3,}\s*\n\s*\*\*출처\*\*\s*/, ''); body = body.slice(0, si); }
  let cta = '';
  const ci = body.lastIndexOf('\n---');
  if (ci >= 0) { cta = body.slice(ci).replace(/^\s*-{3,}\s*/, '').trim(); body = body.slice(0, ci); }

  let ctaHtml = '';
  if (cta) {
    let first = true;
    ctaHtml = md(cta).replace(/<a href="([^"]+)">([^<]*)<\/a>/g, (_, href, label) => {
      const isMain = first && href.includes('#contact'); if (isMain) first = false;
      return isMain
        ? `<a class="btn btn-primary" href="${href}" data-track="service_cta_click" data-track-label="insight_${post.slug}">${label}</a>`
        : `<a class="link" href="${href}">${label}</a>`;
    });
  }
  const srcHtml = sources.trim()
    ? md(sources).replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer"')
    : '';
  // 추천(레퍼럴) 링크: 검색엔진에 광고성 링크임을 알리고, 클릭을 GA4 insight_cta_click 으로 집계한다.
  const refLinks = (html) => html.replace(/<a href="(https:\/\/www\.chinanow\.cc[^"]*)"[^>]*>/g,
    '<a href="$1" target="_blank" rel="sponsored nofollow noopener" data-track="insight_cta_click" data-track-label="chinanow_referral">');
  return { articleHtml: refLinks(md(body)), ctaHtml, srcHtml: refLinks(srcHtml) };
}

const head = ({ title, desc, url, image, type, extra = '' }) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<meta name="author" content="CMD.LAB">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
${extra}
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
</script>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<link rel="stylesheet" href="/assets/css/home-v4.css">
<link rel="stylesheet" href="/assets/css/insight.css">
</head>
<body>
<header><div class="wrap nav">
  <a class="logo" href="/">CMD.LAB</a>
  <nav class="menu" aria-label="Primary"><a href="/#case">사례</a><a href="/#koc">체험단</a><a href="/#miniprogram">미니프로그램</a><a href="/#vietnam">베트남</a><a href="/#plan">진행 방식</a><a href="/#faq">FAQ</a><a href="/insight/">인사이트</a></nav>
  <a class="btn btn-primary" href="/#contact" data-track="hero_cta_click" data-track-label="header">무료 진단 신청</a>
</div></header>
`;

const foot = `
<footer><div class="wrap">
  <b>CMD.LAB 시엠디랩</b><br>
  사업자등록번호 502-28-73944 · 서울특별시 구로구 디지털로31길 12, 2층 · cmdlabkr@gmail.com · 정보처리책임자 김용화<br>
  &copy; 2026 CMD.LAB · <a href="/#contact">무료 진단 신청</a>
</div></footer>
<script src="/assets/js/main.js" defer></script>
</body>
</html>
`;

const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`;

function postPage(post, all) {
  const url = `${SITE}/insight/${post.slug}/`;
  const cover = `${SITE}${IMG_URL(post.slug)}/00_cover.webp`;
  if (!fs.existsSync(path.join(ROOT, 'assets/images/insight', post.slug, '00_cover.webp'))) fail(`${post.file}: 대표 이미지 00_cover.webp 없음`);
  const { articleHtml, ctaHtml, srcHtml } = renderBody(post);
  const others = all.filter((p) => p.slug !== post.slug).slice(0, 3);
  const hubWarn = post.hub && !fs.existsSync(path.join(ROOT, post.hub.replace(/^\//, ''), 'index.html')) ? post.hub : '';
  if (hubWarn) console.warn(`⚠ ${post.file}: hub ${hubWarn} 페이지가 아직 없습니다 (링크가 404가 됩니다).`);
  const jsonld = ld({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', headline: post.title, description: post.description, image: [cover],
        datePublished: post.date, dateModified: post.modified, mainEntityOfPage: url, inLanguage: 'ko',
        author: { '@type': 'Organization', name: 'CMD.LAB', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'CMD.LAB', url: `${SITE}/` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: '인사이트', item: `${SITE}/insight/` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
    ],
  });
  const keywords = Array.isArray(post.keywords) ? post.keywords.join(', ') : '';
  return head({ title: post.seo_title, desc: post.description, url, image: cover, type: 'article', extra: `${keywords ? `<meta name="keywords" content="${esc(keywords)}">\n` : ''}${jsonld}` }) + `
<main class="ins">
<article class="wrap ins-wrap">
  <nav class="crumbs" aria-label="breadcrumb"><a href="/">홈</a> › <a href="/insight/">인사이트</a> › <span>${esc(post.title)}</span></nav>
  <p class="ins-meta">${esc(post.category || '')}<time datetime="${post.date}">${dotDate(post.date)}</time></p>
  <h1>${esc(post.title)}</h1>
  <div class="ins-body">
${articleHtml}
  </div>
${ctaHtml ? `  <aside class="ins-cta">\n${ctaHtml}\n  </aside>\n` : ''}${srcHtml ? `  <section class="ins-src"><h2>출처</h2>\n${srcHtml}\n  </section>\n` : ''}${others.length ? `  <section class="ins-more"><h2>다른 글</h2><div class="ins-cards">\n${others.map((p) => card(p)).join('\n')}\n  </div></section>\n` : ''}</article>
</main>
` + foot;
}

function card(p) {
  return `    <a class="ins-card" href="/insight/${p.slug}/"><img src="${IMG_URL(p.slug)}/00_cover.webp" alt="" loading="lazy" width="${webpSize(path.join(ROOT, 'assets/images/insight', p.slug, '00_cover.webp')).w}" height="${webpSize(path.join(ROOT, 'assets/images/insight', p.slug, '00_cover.webp')).h}"><span class="ins-card-t">${esc(p.title)}</span><span class="ins-card-d">${esc(p.description)}</span><time datetime="${p.date}">${dotDate(p.date)}</time></a>`;
}

function listPage(posts) {
  const desc = '중국·베트남 크로스보더 커머스 소식과 한국 브랜드가 지금 할 일을 원출처 기준으로 정리합니다.';
  const image = `${SITE}${IMG_URL(posts[0].slug)}/00_cover.webp`;
  const jsonld = ld({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: '인사이트', url: `${SITE}/insight/`, description: desc,
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: '인사이트', item: `${SITE}/insight/` } ] },
  });
  return head({ title: '인사이트 - 시엠디랩', desc, url: `${SITE}/insight/`, image, type: 'website', extra: jsonld }) + `
<main class="ins">
<div class="wrap ins-wrap ins-wide">
  <nav class="crumbs" aria-label="breadcrumb"><a href="/">홈</a> › <span>인사이트</span></nav>
  <h1>인사이트</h1>
  <p class="ins-lead">${esc(desc)}</p>
  <div class="ins-cards">
${posts.map(card).join('\n')}
  </div>
</div>
</main>
` + foot;
}

function updateSitemap(posts) {
  const f = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(f, 'utf8');
  xml = xml.replace(/\s*<url>\s*<loc>https:\/\/cmdlab\.kr\/insight\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  if (posts.length) {
    const url = (loc, lastmod, pr) => `\n  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${pr}</priority>\n  </url>`;
    const add = url(`${SITE}/insight/`, posts[0].modified, '0.7') + posts.map((p) => url(`${SITE}/insight/${p.slug}/`, p.modified, '0.6')).join('');
    xml = xml.replace(/\s*<\/urlset>/, `${add}\n</urlset>`);
  }
  fs.writeFileSync(f, xml);
}

function updateLlms(posts) {
  const f = path.join(ROOT, 'llms.txt');
  let t = fs.readFileSync(f, 'utf8').replace(/## 인사이트\n[\s\S]*?(?=\n## |$)/, '').replace(/\n{3,}/g, '\n\n');
  if (posts.length) {
    const sec = `## 인사이트\n- 인사이트 목록: ${SITE}/insight/\n${posts.map((p) => `- ${p.title}: ${SITE}/insight/${p.slug}/`).join('\n')}\n`;
    t = t.includes('\n## 연락') ? t.replace('\n## 연락', `\n${sec}\n## 연락`) : `${t.trimEnd()}\n\n${sec}`;
  }
  fs.writeFileSync(f, t);
}

const posts = loadPosts();
fs.rmSync(OUT_DIR, { recursive: true, force: true });
if (posts.length) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), listPage(posts));
  for (const p of posts) {
    fs.mkdirSync(path.join(OUT_DIR, p.slug), { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, p.slug, 'index.html'), postPage(p, posts));
  }
}
updateSitemap(posts);
updateLlms(posts);
console.log(`✔ 발행 ${posts.length}편 생성${posts.length ? ': ' + posts.map((p) => p.slug).join(', ') : ''}`);
