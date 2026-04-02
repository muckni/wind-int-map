#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(ROOT, "data", "research");

const TOPICS = new Set(["windfarm", "epc", "route"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stripHtml(raw) {
  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function slugify(input) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "source";
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

function findMeta(content, pattern) {
  const m = content.match(pattern);
  return m?.[1] ? cleanText(m[1]) : null;
}

function extractCapacityMw(text) {
  const matches = Array.from(text.matchAll(/\b(\d+(?:\.\d+)?)\s*(GW|MW)\b/gi));
  if (matches.length === 0) return null;

  let best = null;
  for (const m of matches) {
    const raw = Number(m[1]);
    const unit = m[2].toUpperCase();
    if (!Number.isFinite(raw)) continue;
    const mw = unit === "GW" ? raw * 1000 : raw;
    const idx = m.index ?? 0;
    const context = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 30)).toLowerCase();
    const likelyTurbineRating = mw <= 25 && /\bturbine|oem|model\b/.test(context);
    if (likelyTurbineRating) continue;
    if (!best || mw > best.mw) best = { mw, raw: m[0] };
  }

  return best;
}

function normalizeCompanyCandidate(raw) {
  if (!raw) return null;
  const firstChunk = raw.split(/[.;|/]/)[0] ?? "";
  const cleaned = cleanText(firstChunk).replace(/\s{2,}/g, " ");
  if (cleaned.length < 3 || cleaned.length > 90) return null;
  if (cleaned.split(" ").length > 8) return null;
  if (/\b(toggle|comparison|section|contents|history|search|language|type|offshore power|wind farm)\b/i.test(cleaned)) return null;
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(cleaned)) return null;
  if (/\b\d{4}\b/.test(cleaned)) return null;
  if (!/[A-Za-z]/.test(cleaned)) return null;
  if (/^\d/.test(cleaned)) return null;
  return cleaned;
}

function normalizeCounterpartyCandidate(raw) {
  const cleaned = normalizeCompanyCandidate(raw);
  if (!cleaned) return null;
  if (!/^[A-Z][A-Za-z&'()\-]+(?:\s+[A-Z][A-Za-z&'()\-]+)+$/.test(cleaned)) return null;
  return cleaned;
}

function extractPublishedDate(html, text) {
  const candidates = [
    findMeta(html, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i),
    findMeta(html, /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i),
    findMeta(html, /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i),
  ].filter(Boolean);

  if (candidates.length > 0) return candidates[0];

  const dateText = text.match(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\b/i);
  return dateText?.[1] ?? null;
}

async function fetchSource(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "offshore-wind-research-ingest/1.0" },
    });

    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      body: "",
      error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function baseClaim(source, meta, topic, overrides = {}) {
  return {
    claim_id: crypto.randomUUID(),
    topic,
    source_url: source.url,
    source_title: meta.title,
    source_date: meta.sourceDate,
    fetched_at: meta.fetchedAt,
    subject: source.project_name ?? source.subject ?? meta.title,
    field: null,
    value: null,
    unit: null,
    package_group: null,
    role_type: null,
    company: source.company ?? null,
    confidence: "low",
    evidence_excerpt: null,
    review_status: "pending",
    ...overrides,
  };
}

function extractWindfarmClaims(source, text, meta) {
  const claims = [];

  const capacity = extractCapacityMw(text);
  if (capacity) {
    claims.push(baseClaim(source, meta, "windfarm", {
      field: "capacity_mw",
      value: Number(capacity.mw.toFixed(2)),
      unit: "MW",
      evidence_excerpt: capacity.raw,
      confidence: "medium",
    }));
  }

  const turbineCount = text.match(/\b(\d{1,4})\s+(?:offshore\s+)?(?:wind\s+)?turbines?\b/i);
  if (turbineCount) {
    claims.push(baseClaim(source, meta, "windfarm", {
      field: "turbine_count",
      value: Number(turbineCount[1]),
      unit: "count",
      evidence_excerpt: turbineCount[0],
    }));
  }

  const statusPatterns = [
    { regex: /\bunder construction\b/i, status: "under construction" },
    { regex: /\boperational\b/i, status: "operational" },
    { regex: /\bplanned\b/i, status: "planned" },
    { regex: /\bdecommissioned\b/i, status: "decommissioned" },
  ];
  for (const s of statusPatterns) {
    if (s.regex.test(text)) {
      claims.push(baseClaim(source, meta, "windfarm", {
        field: "status_current",
        value: s.status,
        evidence_excerpt: s.status,
      }));
      break;
    }
  }

  const cod = text.match(/\b(?:commissioned|commercial operation date|cod)\b[^.\n]{0,60}\b(20\d{2})\b/i);
  if (cod) {
    claims.push(baseClaim(source, meta, "windfarm", {
      field: "commissioning_year",
      value: Number(cod[1]),
      unit: "year",
      evidence_excerpt: cod[0],
      confidence: "medium",
    }));
  }

  return claims;
}

function extractEpcClaims(source, text, meta) {
  const claims = [];
  const lower = text.toLowerCase();

  const packageGroups = [
    { key: "foundations", regex: /\bfoundation(s)?\b|\bmonopile(s)?\b|\bjacket(s)?\b/i },
    { key: "inter-array cables", regex: /\binter[-\s]?array cable(s)?\b|\biac\b/i },
    { key: "export cables", regex: /\bexport cable(s)?\b/i },
    { key: "wtg", regex: /\bwtg\b|\bwind turbine generator(s)?\b|\bturbine(s)?\b/i },
  ];

  const roleTypes = [
    { key: "MP fabricator", regex: /\bmp fabricator\b|\bmonopile (manufacturer|fabricator)\b/i },
    { key: "TP fabricator", regex: /\btp fabricator\b|\btransition piece (manufacturer|fabricator)\b/i },
    { key: "Jacket fabricator", regex: /\bjacket fabricator\b/i },
    { key: "Foundation installer", regex: /\bfoundation installer\b|\binstallation contractor\b/i },
    { key: "IAC supplier", regex: /\biac supplier\b|\binter[-\s]?array cable supplier\b/i },
    { key: "IAC installer", regex: /\biac installer\b|\binter[-\s]?array cable installer\b/i },
    { key: "Export cable supplier", regex: /\bexport cable supplier\b/i },
    { key: "Export cable installer", regex: /\bexport cable installer\b/i },
    { key: "WTG OEM", regex: /\bwtg oem\b|\bturbine oem\b|\bsiemens gamesa\b|\bvestas\b|\bge vernova\b/i },
    { key: "WTG installer", regex: /\bwtg installer\b|\bturbine installer\b/i },
    { key: "EPC/main contractor", regex: /\bepc contractor\b|\bmain contractor\b/i },
  ];

  const companyFromText =
    normalizeCompanyCandidate(
      text.match(/\b(?:awarded to|contracted to|supplied by|provided by|installed by|manufactured by)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,100})/i)?.[1] ?? null
    ) ?? source.company ?? null;

  for (const p of packageGroups) {
    if (p.regex.test(lower)) {
      claims.push(baseClaim(source, meta, "epc", {
        field: "package_group",
        value: p.key,
        package_group: p.key,
        company: companyFromText,
        evidence_excerpt: p.key,
      }));
    }
  }

  for (const r of roleTypes) {
    if (r.regex.test(text)) {
      claims.push(baseClaim(source, meta, "epc", {
        field: "role_type",
        value: r.key,
        role_type: r.key,
        company: companyFromText,
        evidence_excerpt: r.key,
      }));
    }
  }

  return claims;
}

function extractRouteClaims(source, text, meta) {
  const claims = [];

  const routeTypes = [
    { key: "cfd", regex: /\bcontract for difference\b|\bcfd\b/i },
    { key: "feed-in tariff", regex: /\bfeed[-\s]?in tariff\b|\bfit\b/i },
    { key: "merchant", regex: /\bmerchant\b/i },
    { key: "utility offtake", regex: /\butility offtake\b/i },
    { key: "corporate ppa", regex: /\bcorporate ppa\b|\bpower purchase agreement\b|\bppa\b/i },
  ];

  for (const rt of routeTypes) {
    if (rt.regex.test(text)) {
      claims.push(baseClaim(source, meta, "route", {
        field: "route_to_market",
        value: rt.key,
        evidence_excerpt: rt.key,
      }));
    }
  }

  const counterparty = normalizeCounterpartyCandidate(
    text.match(/\b(?:counterparty|offtaker|purchaser)\s+([A-Z][A-Za-z0-9&.,'()\- ]{2,100})/i)?.[1] ?? null
  );
  if (counterparty) {
    claims.push(baseClaim(source, meta, "route", {
      field: "counterparty",
      value: counterparty.slice(0, 120),
      company: counterparty.slice(0, 120),
      evidence_excerpt: counterparty.slice(0, 120),
      confidence: "medium",
    }));
  }

  const auctionRef = text.match(/\b(auction|allocation round|tender|support scheme|orec)\b/i);
  if (auctionRef?.[1]) {
    claims.push(baseClaim(source, meta, "route", {
      field: "support_scheme_reference",
      value: auctionRef[1].toLowerCase(),
      evidence_excerpt: auctionRef[0],
    }));
  }

  return claims;
}

function dedupeClaims(claims) {
  const seen = new Set();
  const out = [];
  for (const c of claims) {
    const key = [c.topic, c.subject, c.field, c.value, c.source_url].map((v) => (v ?? "").toString().toLowerCase()).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function writeLatestAndStamped(baseDir, fileBase, stamp, content) {
  const stamped = path.join(baseDir, `${fileBase}_${stamp}`);
  const latest = path.join(baseDir, `${fileBase}_latest`);
  fs.writeFileSync(stamped, content);
  fs.writeFileSync(latest, content);
  return { stamped, latest };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = path.resolve(ROOT, args["source-file"] ?? "data/research/source_targets.sample.json");
  const topicFilter = (args.topic ?? "all").toLowerCase();

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Source file not found: ${sourceFile}`);
  }

  const sourceList = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  if (!Array.isArray(sourceList)) {
    throw new Error("Source file must be a JSON array");
  }

  const sources = sourceList
    .map((s) => ({
      topic: (s.topic ?? "").toLowerCase(),
      url: s.url,
      project_name: s.project_name ?? null,
      company: s.company ?? null,
      subject: s.subject ?? null,
      notes: s.notes ?? null,
    }))
    .filter((s) => TOPICS.has(s.topic) && typeof s.url === "string" && s.url.startsWith("http"));

  const filtered = topicFilter === "all" ? sources : sources.filter((s) => s.topic === topicFilter);
  if (filtered.length === 0) {
    throw new Error(`No valid sources found for topic '${topicFilter}'`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fetchedAt = new Date().toISOString();

  const rawDir = path.join(OUT_ROOT, "raw");
  const stagingDir = path.join(OUT_ROOT, "staging");
  const reviewedDir = path.join(OUT_ROOT, "reviewed");
  ensureDir(rawDir);
  ensureDir(stagingDir);
  ensureDir(reviewedDir);

  const rawRecords = [];
  const allClaims = [];

  for (const source of filtered) {
    const res = await fetchSource(source.url);
    const topicRawDir = path.join(rawDir, source.topic);
    ensureDir(topicRawDir);

    const baseName = `${stamp}_${slugify(source.topic)}_${slugify(source.project_name ?? source.subject ?? source.url)}`;
    const htmlPath = path.join(topicRawDir, `${baseName}.html`);

    const title = res.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? cleanText(res.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)[1]) : source.url;
    const text = stripHtml(res.body);
    const sourceDate = extractPublishedDate(res.body, text);

    if (res.ok && res.body) {
      fs.writeFileSync(htmlPath, res.body);
    }

    const rawRecord = {
      id: crypto.randomUUID(),
      topic: source.topic,
      url: source.url,
      project_name: source.project_name,
      fetch_ok: res.ok,
      status_code: res.status,
      fetch_error: res.error,
      title,
      source_date: sourceDate,
      fetched_at: fetchedAt,
      text_excerpt: text.slice(0, 600),
      raw_path: res.ok ? path.relative(ROOT, htmlPath) : null,
    };
    rawRecords.push(rawRecord);

    if (!res.ok) continue;

    const meta = { title, sourceDate, fetchedAt };
    let claims = [];
    if (source.topic === "windfarm") claims = extractWindfarmClaims(source, text, meta);
    if (source.topic === "epc") claims = extractEpcClaims(source, text, meta);
    if (source.topic === "route") claims = extractRouteClaims(source, text, meta);

    allClaims.push(...claims);
  }

  const dedupedClaims = dedupeClaims(allClaims);

  const rawNdjson = rawRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const rawOut = writeLatestAndStamped(rawDir, "sources.ndjson", stamp, rawNdjson);

  const claimsByTopic = {
    windfarm: dedupedClaims.filter((c) => c.topic === "windfarm"),
    epc: dedupedClaims.filter((c) => c.topic === "epc"),
    route: dedupedClaims.filter((c) => c.topic === "route"),
  };

  const csvColumns = [
    "claim_id",
    "topic",
    "subject",
    "field",
    "value",
    "unit",
    "package_group",
    "role_type",
    "company",
    "confidence",
    "source_url",
    "source_title",
    "source_date",
    "fetched_at",
    "evidence_excerpt",
    "review_status",
  ];

  const reviewColumns = [
    ...csvColumns,
    "review_decision",
    "review_note",
    "canonical_value",
    "canonical_table",
  ];

  const outputSummary = {
    stamp,
    sourceFile: path.relative(ROOT, sourceFile),
    sourceCount: filtered.length,
    fetchedOk: rawRecords.filter((r) => r.fetch_ok).length,
    fetchedFailed: rawRecords.filter((r) => !r.fetch_ok).length,
    claims: {
      windfarm: claimsByTopic.windfarm.length,
      epc: claimsByTopic.epc.length,
      route: claimsByTopic.route.length,
      total: dedupedClaims.length,
    },
    files: {
      raw: [path.relative(ROOT, rawOut.stamped), path.relative(ROOT, rawOut.latest)],
      staging: [],
      reviewed: [],
    },
  };

  for (const topic of Object.keys(claimsByTopic)) {
    const claims = claimsByTopic[topic];
    const ndjson = claims.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const csv = toCsv(claims, csvColumns);

    const ndjsonOut = writeLatestAndStamped(stagingDir, `${topic}_claims.ndjson`, stamp, ndjson);
    const csvOut = writeLatestAndStamped(stagingDir, `${topic}_claims.csv`, stamp, csv);

    outputSummary.files.staging.push(path.relative(ROOT, ndjsonOut.stamped), path.relative(ROOT, csvOut.stamped));

    const reviewRows = claims.map((c) => ({
      ...c,
      review_decision: "",
      review_note: "",
      canonical_value: "",
      canonical_table: topic === "windfarm" ? "wind_farms" : topic === "epc" ? "wind_farm_epc_company_roles" : "contracts",
    }));

    const reviewCsv = toCsv(reviewRows, reviewColumns);
    const reviewOut = writeLatestAndStamped(reviewedDir, `${topic}_review_queue.csv`, stamp, reviewCsv);
    outputSummary.files.reviewed.push(path.relative(ROOT, reviewOut.stamped));
  }

  const summaryPath = path.join(OUT_ROOT, `run-summary_${stamp}.json`);
  const summaryLatest = path.join(OUT_ROOT, "run-summary_latest.json");
  fs.writeFileSync(summaryPath, JSON.stringify(outputSummary, null, 2));
  fs.writeFileSync(summaryLatest, JSON.stringify(outputSummary, null, 2));

  console.log(JSON.stringify(outputSummary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
