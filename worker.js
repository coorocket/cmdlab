let cachedModel_v2 = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30m
const DEFAULT_CONTACT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby8AdQ6gR-OM9wpqR-3pYxt7HfDnAznp9UQ0Hn1hvuDMlyHgFEOJ6FP1cSYyNh35b1b/exec";
const ALLOWED_ORIGINS = new Set([
  "https://coorocket.github.io",
  "https://cmdlab.kr",
  "https://www.cmdlab.kr",
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

// ---------- Contact form ----------

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

  const contact = {
    brandUrl: clean(body.brandUrl, 300),
    name: clean(body.name, 80),
    company: clean(body.company, 120),
    email: clean(body.email, 254),
    tel: clean(body.tel, 40),
    country: normalizeCountries(body.countries),
    message: clean(body.message, 3000),
  };

  if (!body.privacyConsent) {
    return json({ ok: false, error: "개인정보 수집·이용 동의가 필요합니다." }, 400, request);
  }

  if (!contact.brandUrl || !contact.name || !contact.company || !contact.email || !contact.tel) {
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

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
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
