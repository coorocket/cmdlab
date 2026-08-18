let cachedModel_v2 = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30m
const DEFAULT_CONTACT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby8AdQ6gR-OM9wpqR-3pYxt7HfDnAznp9UQ0Hn1hvuDMlyHgFEOJ6FP1cSYyNh35b1b/exec";
const NAVER_BLOG_RSS_URL = "https://rss.blog.naver.com/forzeus.xml";
const NAVER_BLOG_URL = "https://blog.naver.com/forzeus";
const NAVER_IMAGE_HOSTS = new Set([
  "blogthumb.pstatic.net",
  "blogpfthumb.phinf.naver.net",
]);
const ALLOWED_ORIGINS = new Set([
  "https://coorocket.github.io",
  "https://cmdlab.kr",
  "https://www.cmdlab.kr",
]);
const ANALYTICS_EVENTS = new Set([
  "page_view",
  "hero_cta_click",
  "solution_cta_click",
  "programs_main_cta_click",
  "service_cta_click",
  "ai_scan_start",
  "ai_scan_success",
  "ai_scan_error",
  "ai_result_cta_click",
  "insight_cta_click",
  "contact_form_start",
  "contact_submit",
  "contact_success",
  "contact_error",
  "kakao_click",
  "blog_home_click",
  "blog_click",
]);
const SERVICE_INTERESTS = new Set([
  "시장 적합성 진단",
  "크로스보더 판매 테스트",
  "현지 유통 확장",
  "아직 모르겠어요",
]);
const MARKET_STAGES = new Set([
  "해외진출 검토",
  "테스트 판매 준비",
  "해외 판매 중",
  "현지 유통 확대",
]);

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("Worker is running", { headers: cors(request) });
    }

    if (url.pathname === "/contact") {
      return handleContact(request, env);
    }

    if (url.pathname === "/analytics-event") {
      return handleAnalyticsEvent(request);
    }

    if (url.pathname === "/blog-posts") {
      return handleBlogPosts(request);
    }

    if (url.pathname === "/blog-image") {
      return handleBlogImage(request);
    }

    if (url.pathname !== "/analyze") {
      return new Response("Not Found", { status: 404, headers: cors(request) });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors(request) });
    }

    try {
      const body = await request.json().catch(() => null);
      const product = (body?.product ?? "").toString().trim();
      const country = (body?.country ?? "").toString().trim();

      if (!product || !country) {
        return json({ error: "Missing product or country" }, 400, request);
      }

      // lightweight input guard
      if (product.length > 120 || country.length > 60) {
        return json({ error: "Input too long" }, 400, request);
      }

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return json({ error: "Missing GEMINI_API_KEY in Worker" }, 500, request);
      }

      // model selection: forced > auto
      const forced = (env.GEMINI_MODEL ?? "").toString().trim();
      const model = forced || (await getAutoModel(apiKey));

      if (!model) {
        return json(
          {
            error: "No available model for generateContent",
            hint:
              "No model supports generateContent for this key/project. Check API enablement, key project, and billing/quota.",
          },
          502,
          request
        );
      }

      // 1) main generation (strict structured keywords)
      const primaryPrompt = buildPrimaryPrompt(product, country);
      const first = await callGemini(apiKey, model, primaryPrompt, 0.2);

      if (!first.ok) {
        return json(
          {
            error: "Gemini API error",
            status: first.status,
            model,
            details: first.details,
            hint:
              "If quota exceeded(limit:0), check billing/quota. If model not found, set GEMINI_MODEL or let auto-detect choose another model.",
          },
          502,
          request
        );
      }

      const parsedMain = parseGeminiPayload(first.rawText, first.responseJson);

      let keywords = normalizeKeywordItems(parsedMain?.keywords, country);
      const platforms = normalizeList(parsedMain?.platforms).slice(0, 10);
      const strategy = typeof parsedMain?.strategy === "string" ? parsedMain.strategy.trim() : "";

      // 2) repair pass if keyword format is not compliant
      if (!isKeywordListCompliant(keywords, country)) {
        const repairPrompt = buildRepairPrompt(keywords, country);
        const repair = await callGemini(apiKey, model, repairPrompt, 0.1);

        if (repair.ok) {
          const parsedRepair = parseGeminiPayload(repair.rawText, repair.responseJson);
          const repaired = normalizeKeywordItems(parsedRepair?.keywords, country);
          if (repaired.length > 0) {
            keywords = repaired;
          }
        }
      }

      // 3) deterministic fallback map for consistency when model still ignores format
      if (!isKeywordListCompliant(keywords, country)) {
        const fallback = fallbackKeywordMap(product, country);
        if (fallback.length > 0) {
          keywords = fallback;
        }
      }

      const finalOut = {
        keywords: keywords.slice(0, 10),
        platforms,
        strategy,
        _meta: {
          modelUsed: model,
          forcedModel: !!forced,
          workerVersion: "2026-02-19-bilingual-v4",
          keywordBilingualComplete: isKeywordListCompliant(keywords, country),
          keywordLocalLanguage: expectedLocalLanguage(country),
        },
      };

      return json(finalOut, 200, request);
    } catch (e) {
      return json({ error: "Server error", details: String(e) }, 500, request);
    }
  },
};

// ---------- Naver blog feed ----------

async function handleBlogPosts(request) {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405, request);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(NAVER_BLOG_RSS_URL, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": "CMD.LAB Blog Feed/1.0",
      },
      signal: controller.signal,
      cf: {
        cacheEverything: true,
        cacheTtl: 1800,
      },
    });

    if (!upstream.ok) {
      return json({ ok: false, error: "네이버 블로그 피드를 불러오지 못했습니다." }, 502, request);
    }

    const contentLength = Number(upstream.headers.get("Content-Length") || 0);
    if (contentLength > 1_000_000) {
      return json({ ok: false, error: "블로그 피드 응답이 너무 큽니다." }, 502, request);
    }

    const xml = await upstream.text();
    if (!xml || xml.length > 1_000_000) {
      return json({ ok: false, error: "블로그 피드 응답을 확인할 수 없습니다." }, 502, request);
    }

    const posts = parseNaverRss(xml, 8);
    if (posts.length === 0) {
      return json({ ok: false, error: "표시할 블로그 포스팅이 없습니다." }, 502, request);
    }

    return json({
      ok: true,
      blogUrl: NAVER_BLOG_URL,
      count: posts.length,
      posts,
      fetchedAt: new Date().toISOString(),
    }, 200, request, "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "네이버 블로그 피드 응답 시간이 초과되었습니다."
      : "네이버 블로그 피드에 연결하지 못했습니다.";
    return json({ ok: false, error: message }, 502, request);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleBlogImage(request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store", ...cors(request) },
    });
  }

  const requestUrl = new URL(request.url);
  const sourceUrl = normalizeNaverImageUrl(requestUrl.searchParams.get("src"));
  if (!sourceUrl) {
    return new Response("Invalid image source", {
      status: 400,
      headers: { "Cache-Control": "no-store", ...cors(request) },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const imageRequest = new Request(sourceUrl, {
      method: "GET",
      headers: {
        Accept: "image/webp",
        "User-Agent": "CMD.LAB Blog Image/1.0",
      },
      signal: controller.signal,
    });
    const transformed = await fetch(imageRequest, {
      cf: {
        image: {
          fit: "cover",
          width: 720,
          height: 480,
          quality: 76,
          format: "webp",
        },
        cacheEverything: true,
        cacheTtl: 2_592_000,
      },
    });
    const contentType = (transformed.headers.get("Content-Type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!transformed.ok || contentType !== "image/webp") {
      return new Response("Image transformation failed", {
        status: 502,
        headers: { "Cache-Control": "no-store", ...cors(request) },
      });
    }

    return new Response(transformed.body, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable",
        "Cross-Origin-Resource-Policy": "cross-origin",
        ...cors(request),
      },
    });
  } catch {
    return new Response("Image transformation failed", {
      status: 502,
      headers: { "Cache-Control": "no-store", ...cors(request) },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseNaverRss(xml, limit) {
  const itemBlocks = (xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [])
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 8)));

  return itemBlocks
    .map((item) => {
      const title = readRssField(item, "title");
      const url = normalizeNaverPostUrl(readRssField(item, "link"));
      const publishedRaw = readRssField(item, "pubDate");
      const publishedDate = new Date(publishedRaw);
      const description = readRssField(item, "description");
      const thumbnailMatch = description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);

      if (!title || !url || Number.isNaN(publishedDate.getTime())) {
        return null;
      }

      return {
        title: clean(title, 180),
        url,
        category: clean(readRssField(item, "category"), 80),
        publishedAt: publishedDate.toISOString(),
        thumbnail: normalizeNaverImageUrl(thumbnailMatch?.[1]) || "",
      };
    })
    .filter(Boolean);
}

function readRssField(block, fieldName) {
  const pattern = new RegExp(
    `<${fieldName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${fieldName}>`,
    "i"
  );
  const match = block.match(pattern);
  if (!match) {
    return "";
  }

  const raw = match[1]
    .trim()
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1");
  return decodeXmlEntities(raw).trim();
}

function decodeXmlEntities(value) {
  return (value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => safeCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function safeCodePoint(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    return "";
  }
  return String.fromCodePoint(value);
}

function normalizeNaverPostUrl(value) {
  try {
    const url = new URL((value || "").trim());
    if (url.protocol !== "https:" ||
        url.hostname !== "blog.naver.com" ||
        !/^\/forzeus\/\d+\/?$/.test(url.pathname)) {
      return "";
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeNaverImageUrl(value) {
  try {
    const raw = (value || "").trim();
    if (!raw || raw.length > 3000) {
      return "";
    }

    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !NAVER_IMAGE_HOSTS.has(url.hostname)) {
      return "";
    }
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

// ---------- Contact form ----------

async function handleAnalyticsEvent(request) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405, request);
  }

  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, error: "Origin not allowed" }, 403, request);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 2_000) {
    return json({ ok: false, error: "Request body too large" }, 413, request);
  }

  const raw = await request.text();
  if (!raw || raw.length > 2_000) {
    return json({ ok: false, error: "Invalid event body" }, 400, request);
  }

  const body = tryJsonParse(raw);
  const event = clean(body?.event, 60);
  const path = clean(body?.path, 200);
  const label = clean(body?.label, 80);

  if (!ANALYTICS_EVENTS.has(event) || !path.startsWith("/") || path.includes("?")) {
    return json({ ok: false, error: "Invalid event" }, 400, request);
  }

  if (label && !SERVICE_INTERESTS.has(label)) {
    return json({ ok: false, error: "Invalid event label" }, 400, request);
  }

  console.log(JSON.stringify({
    type: "conversion",
    event,
    path,
    label,
    occurredAt: new Date().toISOString(),
  }));

  return json({ ok: true }, 202, request);
}

async function handleContact(request, env) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405, request);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 20_000) {
    return json({ ok: false, error: "Request body too large" }, 413, request);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "Invalid JSON body" }, 400, request);
  }

  // Honeypot: acknowledge bots without forwarding their payload.
  if (clean(body.website, 200)) {
    return json({ ok: true }, 200, request);
  }

  const serviceInterest = clean(body.serviceInterest, 80);
  const marketStage = clean(body.marketStage, 80);
  const country = normalizeCountries(body.countries);
  const message = clean(body.message, 3000);
  const contact = {
    brandUrl: clean(body.brandUrl, 300),
    serviceInterest,
    marketStage,
    name: clean(body.name, 80),
    company: clean(body.company, 120),
    email: clean(body.email, 254),
    tel: clean(body.tel, 40),
    country,
    message: clean([
      `희망 서비스: ${serviceInterest}`,
      `현재 진출 단계: ${marketStage}`,
      `진출 희망 국가: ${country}`,
      "",
      `문의 내용: ${message || "(미입력)"}`,
    ].join("\n"), 3500),
  };

  if (!body.privacyConsent) {
    return json({ ok: false, error: "개인정보 수집·이용 동의가 필요합니다." }, 400, request);
  }

  if (!SERVICE_INTERESTS.has(serviceInterest) || !MARKET_STAGES.has(marketStage)) {
    return json({ ok: false, error: "희망 서비스와 현재 진출 단계를 확인해 주세요." }, 400, request);
  }

  if (!contact.brandUrl || !contact.name || !contact.company || !contact.email || !contact.tel || !contact.country) {
    return json({ ok: false, error: "필수 입력 항목을 확인해 주세요." }, 400, request);
  }

  if (!isValidEmail(contact.email)) {
    return json({ ok: false, error: "이메일 주소 형식을 확인해 주세요." }, 400, request);
  }

  const scriptUrl = clean(env.CONTACT_SCRIPT_URL || DEFAULT_CONTACT_SCRIPT_URL, 1000);
  if (!scriptUrl.startsWith("https://script.google.com/")) {
    return json({ ok: false, error: "문의 저장소 설정을 확인해 주세요." }, 500, request);
  }

  const params = new URLSearchParams({
    ...contact,
    privacyConsent: "동의",
    source: "CMD.LAB website",
    submittedAt: new Date().toISOString(),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const upstream = await fetch(scriptUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString(),
      signal: controller.signal,
    });
    const raw = await upstream.text().catch(() => "");
    const payload = tryJsonParse(raw);

    if (!upstream.ok || payload?.ok === false || payload?.success === false) {
      return json({ ok: false, error: "문의 저장을 확인하지 못했습니다." }, 502, request);
    }

    return json({ ok: true, message: "문의 접수가 확인되었습니다." }, 200, request);
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "문의 저장소 응답 시간이 초과되었습니다."
      : "문의 저장소에 연결하지 못했습니다.";
    return json({ ok: false, error: message }, 502, request);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Gemini calls ----------

async function callGemini(apiKey, model, prompt, temperature) {
  const geminiUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const resp = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
      },
    }),
  });

  const raw = await resp.text().catch(() => "");
  const details = extractGoogleErrorMessage(raw) || raw;
  const responseJson = tryJsonParse(raw) || null;

  return {
    ok: resp.ok,
    status: resp.status,
    details,
    rawText: raw,
    responseJson,
  };
}

function parseGeminiPayload(rawText, responseJson) {
  // 1) raw response may already be final JSON
  const direct = safeJsonParse(rawText) || tryJsonParse(rawText);
  if (direct && (direct.keywords || direct.platforms || direct.strategy)) {
    return direct;
  }

  // 2) Gemini standard candidates path
  const text =
    responseJson?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("") ||
    "";

  const parsedFromText = safeJsonParse(text) || tryJsonParse(text);
  if (parsedFromText) {
    return parsedFromText;
  }

  return {
    keywords: [],
    platforms: [],
    strategy: typeof text === "string" ? text.trim() : "",
  };
}

function buildPrimaryPrompt(product, country) {
  const localLang = expectedLocalLanguage(country);

  return `
You are a market analyst for global commerce.
Analyze market potential for product "${product}" in "${country}".

Return JSON ONLY. No markdown. No explanations.
Output schema:
{
  "keywords": [
    { "ko": "Korean keyword", "local": "${localLang} keyword" }
  ],
  "platforms": ["string", "..."],
  "strategy": "string (Korean, one sentence)"
}

Rules:
- keywords: exactly 6 items
- each keyword MUST include ko + local
- local MUST be ${localLang}
- no plain Korean-only keyword items
- platforms: up to 10 items
- strategy: Korean one sentence
`.trim();
}

function buildRepairPrompt(keywordList, country) {
  const localLang = expectedLocalLanguage(country);
  return `
Reformat the keyword list below.
Return JSON ONLY with schema:
{
  "keywords": [
    { "ko": "Korean keyword", "local": "${localLang} keyword" }
  ]
}

Rules:
- keep the same meaning
- output exactly 6 items
- each item must contain ko and local
- local language must be ${localLang}

Input:
${JSON.stringify(keywordList)}
`.trim();
}

// ---------- Model auto-detect ----------

async function getAutoModel(apiKey) {
  const now = Date.now();
  if (cachedModel_v2 && now - cachedAt < CACHE_TTL_MS) return cachedModel_v2;

  const listUrl =
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
    encodeURIComponent(apiKey);

  const resp = await fetch(listUrl, { method: "GET" });
  const raw = await resp.text().catch(() => "");

  // if list fails, fallback to stable alias
  if (!resp.ok) return "gemini-1.5-flash";

  const obj = tryJsonParse(raw) || {};
  const models = Array.isArray(obj.models) ? obj.models : [];

  const candidates = models
    .map((m) => ({
      name: (m?.name || "").toString(),
      methods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
    }))
    .filter((m) => m.name.startsWith("models/"))
    .filter((m) => m.methods.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  if (candidates.length === 0) return "gemini-1.5-flash";

  const preferredOrder = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-1.5-pro-002",
    "gemini-1.5-pro-001",
    "gemini-1.0-pro",
    "gemini-pro",
  ];

  let chosen = preferredOrder.find((p) => candidates.includes(p));
  if (!chosen) chosen = candidates.find((c) => c.includes("1.5") && c.includes("flash"));
  if (!chosen) chosen = candidates.find((c) => !c.startsWith("gemini-2.0"));
  if (!chosen && candidates.length > 0) chosen = candidates[0];
  if (!chosen) chosen = "gemini-1.5-flash";

  cachedModel_v2 = chosen;
  cachedAt = now;
  return chosen;
}

// ---------- format validators / normalizers ----------

function expectedLocalLanguage(country) {
  const c = (country || "").toLowerCase();
  if (c.includes("china") || c.includes("중국")) return "Simplified Chinese";
  if (c.includes("vietnam") || c.includes("베트남")) return "Vietnamese";
  return "Local language";
}

function isChineseText(text) {
  return /[\u4E00-\u9FFF]/.test(text || "");
}

function isVietnameseText(text) {
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text || "");
}

function localLanguageValidByCountry(local, country) {
  const c = (country || "").toLowerCase();
  if (c.includes("china") || c.includes("중국")) return isChineseText(local);
  if (c.includes("vietnam") || c.includes("베트남")) return isVietnameseText(local);
  return !!(local || "").trim();
}

function normalizeKeywordItems(rawKeywords, country) {
  const items = [];

  for (const item of Array.isArray(rawKeywords) ? rawKeywords : []) {
    if (!item) continue;

    if (typeof item === "object") {
      const ko = (item.ko || item.korean || "").toString().trim();
      const local = (item.local || item.native || "").toString().trim();
      if (ko && local && localLanguageValidByCountry(local, country)) {
        items.push(`${ko} (${local})`);
        continue;
      }
    }

    if (typeof item === "string") {
      const text = item.trim();
      const m = text.match(/^(.+?)\s*\((.+)\)$/);
      if (m) {
        const ko = m[1].trim();
        const local = m[2].trim();
        if (ko && local && localLanguageValidByCountry(local, country)) {
          items.push(`${ko} (${local})`);
        }
      }
    }
  }

  // de-duplicate while preserving order
  const seen = new Set();
  return items.filter((v) => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

function isKeywordListCompliant(list, country) {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.every((item) => {
    const m = (item || "").match(/^(.+?)\s*\((.+)\)$/);
    if (!m) return false;
    const local = m[2].trim();
    return localLanguageValidByCountry(local, country);
  });
}

function fallbackKeywordMap(product, country) {
  const p = (product || "").trim();
  const c = (country || "").toLowerCase();

  if (c.includes("china") || c.includes("중국")) {
    if (p.includes("등산화")) {
      return [
        "등산화 (登山鞋)",
        "트레킹화 (徒步鞋)",
        "방수 등산화 (防水登山鞋)",
        "경량 등산화 (轻量登山鞋)",
        "아웃도어 신발 (户外鞋)",
        "미끄럼 방지 (防滑)",
      ];
    }
    if (p.includes("샴푸")) {
      return [
        "샴푸 (洗发水)",
        "두피 케어 (头皮护理)",
        "탈모 방지 (防脱发)",
        "무실리콘 (无硅油)",
        "약산성 샴푸 (弱酸性洗发水)",
        "손상모 케어 (受损发质护理)",
      ];
    }
  }

  if (c.includes("vietnam") || c.includes("베트남")) {
    if (p.includes("스마트폰")) {
      return [
        "스마트폰 (điện thoại thông minh)",
        "가성비 스마트폰 (điện thoại giá tốt)",
        "게이밍폰 (điện thoại chơi game)",
        "카메라 성능 (camera chất lượng cao)",
        "5G 스마트폰 (điện thoại 5G)",
        "중저가 모델 (phân khúc tầm trung)",
      ];
    }
  }

  return [];
}

// ---------- helpers ----------

function cors(request) {
  const origin = request?.headers?.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://coorocket.github.io";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(obj, status = 200, request, cacheControl = "no-store") {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...cors(request),
    },
  });
}

function clean(value, maxLength) {
  return (value ?? "").toString().trim().slice(0, maxLength);
}

function normalizeCountries(value) {
  const items = Array.isArray(value) ? value : [value];
  const allowed = new Set(["China", "Vietnam", "Other"]);
  return items
    .map((item) => clean(item, 30))
    .filter((item) => allowed.has(item))
    .join(", ");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function tryJsonParse(str) {
  try {
    return JSON.parse((str || "").toString());
  } catch {
    return null;
  }
}

function safeJsonParse(str) {
  try {
    const s = (str || "").toString().trim();
    const cleaned = s.replace(/```json/gi, "```").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,|•|-/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function extractGoogleErrorMessage(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj?.error?.message || null;
  } catch {
    return null;
  }
}
