#!/usr/bin/env node
import path from "node:path";
import { Pool } from "pg";
import { loadEnvFile, readCsv, writeJson } from "./_farm-ingest-utils.mjs";

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "data", "raw", "contractor_package_research_2026-04-02.csv");
const REPORT_PATH = path.join(ROOT, "data", "qa", "epc-expansion-latest.json");
const BATCH_NAME = "epc_contractor_expansion_2026_04_02";

const COMPANY_DEFS = {
  "Skyborn Renewables": {
    actorType: "developer",
    hqCountryCode: "DE",
    website: "https://www.skybornrenewables.com",
    hq: { city: "Hamburg", countryCode: "DE", lat: 53.551086, lng: 9.993682 },
  },
  "Cadeler": {
    actorType: "other",
    hqCountryCode: "DK",
    website: "https://www.cadeler.com",
    hq: { city: "Copenhagen", countryCode: "DK", lat: 55.676111111111, lng: 12.568888888889 },
  },
  "DEME Offshore": {
    actorType: "other",
    hqCountryCode: "BE",
    website: "https://www.deme-group.com",
    hq: { city: "Zwijndrecht", countryCode: "BE", lat: 51.219448, lng: 4.402464 },
  },
  "EEW SPC": {
    actorType: "other",
    hqCountryCode: "DE",
    website: "https://www.eew-group.com",
    hq: { city: "Erndtebrück", countryCode: "DE", lat: 50.988888888889, lng: 8.2555555555556 },
  },
  "GE Vernova": {
    actorType: "oem",
    hqCountryCode: "US",
    website: "https://www.gevernova.com",
    hq: { city: "Cambridge", countryCode: "US", lat: 42.375, lng: -71.106111111111 },
  },
  "Global Energy Group": {
    actorType: "other",
    hqCountryCode: "GB",
    website: "https://www.globalenergygroup.co.uk",
    hq: { city: "Inverness", countryCode: "GB", lat: 57.477773, lng: -4.224721 },
  },
  "Hellenic Cables": {
    actorType: "other",
    hqCountryCode: "GR",
    website: "https://www.hellenic-cables.com",
    hq: { city: "Athens", countryCode: "GR", lat: 37.98381, lng: 23.727539 },
  },
  "JDR Cable Systems": {
    actorType: "other",
    hqCountryCode: "GB",
    website: "https://www.jdrcables.com",
    hq: { city: "Hartlepool", countryCode: "GB", lat: 54.685, lng: -1.21 },
  },
  "Nexans": {
    actorType: "other",
    hqCountryCode: "FR",
    website: "https://www.nexans.com",
    hq: { city: "Paris", countryCode: "FR", lat: 48.85666666666667, lng: 2.352222222222222 },
  },
  "NKT": {
    actorType: "other",
    hqCountryCode: "DK",
    website: "https://www.nkt.com",
    hq: { city: "Brøndby", countryCode: "DK", lat: 55.644111, lng: 12.4217135 },
  },
  "Prysmian": {
    actorType: "other",
    hqCountryCode: "IT",
    website: "https://www.prysmian.com/en",
    hq: { city: "Milan", countryCode: "IT", lat: 45.466944444444, lng: 9.19 },
  },
  "Seaway7": {
    actorType: "other",
    hqCountryCode: "LU",
    website: "https://www.seaway7.com",
    hq: { city: "Luxembourg", countryCode: "LU", lat: 49.611622, lng: 6.131935 },
  },
  "Siemens Gamesa Renewable Energy": {
    actorType: "oem",
    hqCountryCode: "ES",
    website: "https://www.siemensgamesa.com",
    hq: { city: "Zamudio", countryCode: "ES", lat: 43.2827605, lng: -2.8623645 },
  },
  "Sif": {
    actorType: "other",
    hqCountryCode: "NL",
    website: "https://www.sif-group.com",
    hq: { city: "Roermond", countryCode: "NL", lat: 51.194168, lng: 5.987516 },
  },
  "Smulders": {
    actorType: "other",
    hqCountryCode: "BE",
    website: "https://www.smulders.com",
    hq: { city: "Arendonk", countryCode: "BE", lat: 51.322051, lng: 5.083741 },
  },
  "TKF": {
    actorType: "other",
    hqCountryCode: "NL",
    website: "https://www.tkf.nl",
    hq: { city: "Haaksbergen", countryCode: "NL", lat: 52.156111, lng: 6.738889 },
  },
  "Van Oord": {
    actorType: "other",
    hqCountryCode: "NL",
    website: "https://www.vanoord.com",
    hq: { city: "Rotterdam", countryCode: "NL", lat: 51.92, lng: 4.48 },
  },
  "Vestas Wind Systems": {
    actorType: "oem",
    hqCountryCode: "DK",
    website: "https://www.vestas.com",
    hq: { city: "Aarhus", countryCode: "DK", lat: 56.156388888889, lng: 10.209722222222 },
  },
  "Boskalis": {
    actorType: "other",
    hqCountryCode: "NL",
    website: "https://www.boskalis.com",
    hq: { city: "Papendrecht", countryCode: "NL", lat: 51.8319, lng: 4.6878 },
  },
  "Aibel": {
    actorType: "other",
    hqCountryCode: "NO",
    website: "https://aibel.com",
    hq: { city: "Stavanger", countryCode: "NO", lat: 58.969976, lng: 5.733107 },
  },
  "Dajin Heavy Industry": {
    actorType: "other",
    hqCountryCode: "CN",
    website: "https://www.dajin.cn",
    hq: { city: "Penglai", countryCode: "CN", lat: 37.811, lng: 120.758 },
  },
  "Fred. Olsen Windcarrier": {
    actorType: "other",
    hqCountryCode: "NO",
    website: "https://windcarrier.com",
    hq: { city: "Oslo", countryCode: "NO", lat: 59.9139, lng: 10.7522 },
  },
  "Hitachi Energy": {
    actorType: "other",
    hqCountryCode: "CH",
    website: "https://www.hitachienergy.com",
    hq: { city: "Zurich", countryCode: "CH", lat: 47.37444444444444, lng: 8.54111111111111 },
  },
  "Jan De Nul": {
    actorType: "other",
    hqCountryCode: "BE",
    website: "https://www.jandenul.com/en",
    hq: { city: "Belgium", countryCode: "BE", lat: 50.641111111111, lng: 4.6680555555556 },
  },
};

const COMPANY_ALIASES = {
  "EEW": "EEW SPC",
  "MHI Vestas": "Vestas Wind Systems",
  "Prysmian Group": "Prysmian",
  "Siemens Gamesa": "Siemens Gamesa Renewable Energy",
  "Swire Blue Ocean (Cadeler)": "Cadeler",
  "TELE-FONIKA Kable (TFK)": "TKF",
  "Vestas": "Vestas Wind Systems",
};

const SKYBORN_PROJECTS = [
  {
    name: "Gennaker",
    countryCode: "DE",
    seaBasin: "baltic sea",
    statusCurrent: "planned",
    capacityMw: 976.5,
    turbineCount: 63,
    turbineOem: "Siemens Gamesa Renewable Energy",
    turbineModel: "SG 14-236",
    distanceShoreKm: 15,
    foundationType: "monopile",
    commissionedDate: null,
    lat: 54.608893,
    lng: 12.682515,
    sourceTitle: "Skyborn Renewables - Our projects",
    sourceUrl: "https://www.skybornrenewables.com/company/our_projects",
    sourceNote: "Skyborn lists Gennaker in Germany at >976.5 MW; centroid aligned to published Baltic Sea project coordinate.",
  },
  {
    name: "Nordergründe",
    countryCode: "DE",
    seaBasin: "north sea",
    statusCurrent: "operational",
    capacityMw: 111,
    turbineCount: 18,
    turbineOem: "Senvion",
    turbineModel: "6.2M126",
    distanceShoreKm: 13,
    foundationType: "monopile",
    commissionedDate: "2017-01-01",
    lat: 53.94,
    lng: 8.855,
    sourceTitle: "Skyborn Renewables - Germany portfolio",
    sourceUrl: "https://www.skybornrenewables.com/company/our_projects",
    sourceNote: "Skyborn lists Nordergründe in Germany; centroid set to the published Nordergründe named area in Lower Saxony waters.",
  },
];

const SKYBORN_PORTFOLIO_LINKS = [
  {
    farmName: "Fécamp",
    countryCode: "FR",
    roleType: "equity partner",
    equitySharePct: null,
    confidence: "inferred",
    sourceTitle: "Skyborn Renewables - Parc eolien en mer de Fecamp",
    sourceUrl: "https://www.skybornrenewables.com/markets/france/local/fecamp",
    notes: "Skyborn states the project was initiated by Skyborn and realised in consortium with EDF power solutions and Enbridge.",
  },
  {
    farmName: "Revolution Wind",
    countryCode: "US",
    roleType: "equity partner",
    equitySharePct: 50,
    confidence: "confirmed",
    sourceTitle: "Skyborn Renewables - Americas Region",
    sourceUrl: "https://www.skybornrenewables.com/markets/region/americas",
    notes: "Skyborn states it entered a U.S. offshore wind joint venture with a 50% stake in Revolution Wind.",
  },
  {
    farmName: "South Fork Wind",
    countryCode: "US",
    roleType: "equity partner",
    equitySharePct: 50,
    confidence: "confirmed",
    sourceTitle: "Skyborn Renewables - Americas Region",
    sourceUrl: "https://www.skybornrenewables.com/markets/region/americas",
    notes: "Skyborn states it entered a U.S. offshore wind joint venture with a 50% stake in South Fork Wind.",
  },
  {
    farmName: "Yunlin",
    countryCode: "TW",
    roleType: "equity partner",
    equitySharePct: 31.98,
    confidence: "confirmed",
    sourceTitle: "TotalEnergies and Partners Inaugurate 640 MW Yunlin Wind Farm in Taiwan",
    sourceUrl: "https://totalenergies.com/system/files/documents/totalenergies_PR_TotalEnergies-and-Partners-Inaugurate-Yunlin-Offshore-Wind-Farm_2025_en.pdf",
    notes: "TotalEnergies states Skyborn Renewables holds 31.98% in Yunneng Wind Power and led the development and construction of Yunlin.",
  },
];

const GENNAKER_EPC_ROWS = [
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "EEW SPC",
    packageCode: "foundations",
    roleType: "MP fabricator",
    confidence: "medium",
    sourceTitle: "Skyborn secures all major contractors for Gennaker offshore wind farm",
    sourceUrl: "https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_major_contractors_signed",
    sourceDate: "2025-09-01",
    notes: "PSA for supply of 63 monopile foundations.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "Dajin Heavy Industry",
    packageCode: "foundations",
    roleType: "TP fabricator",
    confidence: "medium",
    sourceTitle: "Skyborn secures all major contractors for Gennaker offshore wind farm",
    sourceUrl: "https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_major_contractors_signed",
    sourceDate: "2025-09-01",
    notes: "PSA for supply of 63 transition pieces.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "Seaway7",
    packageCode: "foundations",
    roleType: "Foundation installer",
    confidence: "high",
    sourceTitle: "Subsea7 awarded contract offshore Germany",
    sourceUrl: "https://www.subsea7.com/en/media/company-news/2026/Subsea7_awarded_contract_offshore_Germany.html",
    sourceDate: "2026-01-29",
    notes: "Transportation and installation of 63 monopiles and transition pieces.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "TKF",
    packageCode: "inter-array cables",
    roleType: "IAC supplier",
    confidence: "high",
    sourceTitle: "Boskalis secures contract for the inter-array cable system at the Gennaker Offshore Wind Farm",
    sourceUrl: "https://boskalis.com/press/press-releases-and-company-news/boskalis-secures-contract-for-the-inter-array-cable-system-at-the-gennaker-offshore-wind-farm",
    sourceDate: "2026-02-26",
    notes: "Consortium contract with Boskalis and TKF for about 140 km of 66 kV inter-array cables.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "Boskalis",
    packageCode: "inter-array cables",
    roleType: "IAC installer",
    confidence: "high",
    sourceTitle: "Boskalis secures contract for the inter-array cable system at the Gennaker Offshore Wind Farm",
    sourceUrl: "https://boskalis.com/press/press-releases-and-company-news/boskalis-secures-contract-for-the-inter-array-cable-system-at-the-gennaker-offshore-wind-farm",
    sourceDate: "2026-02-26",
    notes: "Boskalis to install the inter-array cable system with BOKA Ocean.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "Siemens Gamesa Renewable Energy",
    packageCode: "wtg",
    roleType: "WTG OEM",
    confidence: "medium",
    sourceTitle: "Skyborn confirms Siemens Gamesa agreements for Gennaker",
    sourceUrl: "https://www.skybornrenewables.com/articles/newsroom/Skyborn_confirms_Siemens_Gamesa_agreements",
    sourceDate: "2025-07-18",
    notes: "TSA and long-term service agreement for 63 SG 14-236 turbines.",
  },
  {
    farmName: "Gennaker",
    countryCode: "DE",
    companyName: "Fred. Olsen Windcarrier",
    packageCode: "wtg",
    roleType: "WTG installer",
    confidence: "medium",
    sourceTitle: "Skyborn enters Preferred Supplier Agreement with Fred. Olsen Windcarrier for Gennaker",
    sourceUrl: "https://www.skybornrenewables.com/articles/newsroom/Gennaker_PSA_offshore_installation_vessel",
    sourceDate: "2025-07-29",
    notes: "Preferred supplier agreement for offshore wind turbine transportation and installation vessel services.",
  },
];

const EXTRA_EPC_ROWS = [
  {
    farmName: "Hornsea Three",
    countryCode: "GB",
    companyName: "Jan De Nul",
    packageCode: "export cables",
    roleType: "Export cable installer",
    confidence: "high",
    sourceTitle: "Jan De Nul signs Ørsted's Hornsea 3 export cable contract",
    sourceUrl: "https://www.jandenul.com/news/jan-de-nul-signs-orsteds-hornsea-3-export-cable-contract",
    sourceDate: "2023-08-11",
    notes: "Jan De Nul is responsible for seabed preparation plus transport, installation, and protection of the DC export cables for Hornsea 3.",
  },
  {
    farmName: "Dogger Bank A",
    countryCode: "GB",
    companyName: "Aibel",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "high",
    sourceTitle: "Dogger Bank Offshore Wind Farm - Aibel",
    sourceUrl: "https://aibel.com/project/dogger-bank-offshore-wind-farm",
    sourceDate: "2019-10-30",
    notes: "Aibel will deliver the converter platform and jacket for Dogger Bank A as part of the HVDC transmission system.",
  },
  {
    farmName: "Dogger Bank B",
    countryCode: "GB",
    companyName: "Aibel",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "high",
    sourceTitle: "Dogger Bank Offshore Wind Farm - Aibel",
    sourceUrl: "https://aibel.com/project/dogger-bank-offshore-wind-farm",
    sourceDate: "2019-10-30",
    notes: "Aibel will deliver the converter platform and jacket for Dogger Bank B as part of the HVDC transmission system.",
  },
  {
    farmName: "Dogger Bank C",
    countryCode: "GB",
    companyName: "Aibel",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "high",
    sourceTitle: "Dogger Bank C offshore wind contract awarded to Aibel",
    sourceUrl: "https://aibel.com/news/dogger-bank-c-offshore-wind-contract-awarded-to-aibel",
    sourceDate: "2021-02-17",
    notes: "Aibel was awarded the EPC contract for the Dogger Bank C converter platform and jacket.",
  },
  {
    farmName: "Dogger Bank A",
    countryCode: "GB",
    companyName: "Hitachi Energy",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "medium",
    sourceTitle: "Dogger Bank A offshore substation has arrived in Haugesund",
    sourceUrl: "https://aibel.com/news/dogger-bank-a-offshore-substation-has-arrived-in-haugesund",
    sourceDate: "2022-06-29",
    notes: "Hitachi Energy will install the HVDC converter equipment on Dogger Bank A's offshore platform.",
  },
  {
    farmName: "Dogger Bank B",
    countryCode: "GB",
    companyName: "Hitachi Energy",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "medium",
    sourceTitle: "Second Dogger Bank substation successfully installed",
    sourceUrl: "https://aibel.com/news/second-dogger-bank-substation-successfully-installed",
    sourceDate: "2023-05-12",
    notes: "Hitachi Energy is the HVDC technology partner on the Dogger Bank converter platforms, including Dogger Bank B.",
  },
  {
    farmName: "Dogger Bank C",
    countryCode: "GB",
    companyName: "Hitachi Energy",
    packageCode: "export cables",
    roleType: "EPC contractor",
    confidence: "medium",
    sourceTitle: "Dogger Bank Offshore Wind Farm - Aibel",
    sourceUrl: "https://aibel.com/project/dogger-bank-offshore-wind-farm",
    sourceDate: "2021-02-17",
    notes: "Aibel's Dogger Bank project page states the platforms are outfitted with Hitachi's HVDC converter technology, including Dogger Bank C.",
  },
];

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function packageCodeFromCsv(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (text === "wtg") return "wtg";
  if (text === "foundations") return "foundations";
  if (text === "inter-array cables") return "inter-array cables";
  if (text === "export cables") return "export cables";
  return null;
}

function canonicalCompanyName(raw) {
  const trimmed = normalizeWhitespace(raw);
  return COMPANY_ALIASES[trimmed] ?? trimmed;
}

function normalizedName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function toBoolean(value) {
  return /^true$/i.test(String(value ?? "").trim());
}

function countryCodeFromSource(value) {
  const text = normalizeWhitespace(value);
  if (text === "United Kingdom") return "GB";
  if (text === "Poland") return "PL";
  if (text === "Netherlands") return "NL";
  if (text === "Germany") return "DE";
  return null;
}

async function upsertCompany(client, name, summary) {
  const def = COMPANY_DEFS[name];
  if (!def) {
    throw new Error(`Missing company definition for ${name}`);
  }

  const result = await client.query(
    `
    INSERT INTO companies (name, actor_type, hq_country_code, website, ingest_batch_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (normalized_name) DO UPDATE
    SET
      actor_type = CASE
        WHEN lower(companies.actor_type) IN ('unknown', 'other') AND lower(EXCLUDED.actor_type) <> lower(companies.actor_type)
          THEN EXCLUDED.actor_type
        ELSE companies.actor_type
      END,
      hq_country_code = COALESCE(companies.hq_country_code, EXCLUDED.hq_country_code),
      website = COALESCE(companies.website, EXCLUDED.website),
      updated_at = now()
    RETURNING id, xmax = 0 AS inserted
    `,
    [name, def.actorType, def.hqCountryCode, def.website, summary.batchId]
  );

  const row = result.rows[0];
  if (row.inserted) summary.companiesInserted += 1;
  else summary.companiesUpdated += 1;

  if (def.hq) {
    const hqResult = await client.query(
      `
      INSERT INTO company_locations (company_id, location, location_type, city, country_code)
      VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 'hq', $4, $5)
      ON CONFLICT (company_id, location_type) DO UPDATE
      SET
        location = EXCLUDED.location,
        city = EXCLUDED.city,
        country_code = EXCLUDED.country_code
      RETURNING xmax = 0 AS inserted
      `,
      [row.id, def.hq.lng, def.hq.lat, def.hq.city, def.hq.countryCode]
    );

    if (hqResult.rows[0]?.inserted) summary.companyLocationsInserted += 1;
    else summary.companyLocationsUpdated += 1;
  }

  return row.id;
}

async function ensureSkybornFarm(client, farm, skybornId, summary) {
  const result = await client.query(
    `
    INSERT INTO wind_farms (
      name,
      country_code,
      sea_basin,
      status_current,
      capacity_mw,
      turbine_count,
      developer_company_id,
      foundation_type,
      centroid,
      commissioned_date,
      data_quality,
      ingest_batch_id,
      distance_shore_km,
      turbine_model,
      turbine_oem,
      geometry_quality
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
      $11, 'unverified', $12, $13, $14, $15, 'approximated'
    )
    ON CONFLICT (country_code, normalized_name) DO UPDATE
    SET
      sea_basin = COALESCE(EXCLUDED.sea_basin, wind_farms.sea_basin),
      status_current = COALESCE(EXCLUDED.status_current, wind_farms.status_current),
      capacity_mw = COALESCE(EXCLUDED.capacity_mw, wind_farms.capacity_mw),
      turbine_count = COALESCE(EXCLUDED.turbine_count, wind_farms.turbine_count),
      developer_company_id = COALESCE(EXCLUDED.developer_company_id, wind_farms.developer_company_id),
      foundation_type = COALESCE(EXCLUDED.foundation_type, wind_farms.foundation_type),
      centroid = COALESCE(EXCLUDED.centroid, wind_farms.centroid),
      commissioned_date = COALESCE(EXCLUDED.commissioned_date, wind_farms.commissioned_date),
      distance_shore_km = COALESCE(EXCLUDED.distance_shore_km, wind_farms.distance_shore_km),
      turbine_model = COALESCE(EXCLUDED.turbine_model, wind_farms.turbine_model),
      turbine_oem = COALESCE(EXCLUDED.turbine_oem, wind_farms.turbine_oem),
      geometry_quality = COALESCE(EXCLUDED.geometry_quality, wind_farms.geometry_quality),
      updated_at = now()
    RETURNING id, xmax = 0 AS inserted
    `,
    [
      farm.name,
      farm.countryCode,
      farm.seaBasin,
      farm.statusCurrent,
      farm.capacityMw,
      farm.turbineCount,
      skybornId,
      farm.foundationType,
      farm.lng,
      farm.lat,
      farm.commissionedDate,
      summary.batchId,
      farm.distanceShoreKm,
      farm.turbineModel,
      farm.turbineOem,
    ]
  );

  if (result.rows[0]?.inserted) summary.skybornFarmsInserted += 1;
  else summary.skybornFarmsUpdated += 1;

  return result.rows[0].id;
}

async function upsertOwnershipLink(client, values, summary) {
  const existing = await client.query(
    `
    SELECT id
    FROM wind_farm_ownership
    WHERE wind_farm_id = $1
      AND company_id = $2
      AND lower(role_type) = lower($3)
      AND is_current = true
      AND (
        (equity_share_pct IS NULL AND $4::numeric IS NULL)
        OR equity_share_pct = $4::numeric
      )
    LIMIT 1
    `,
    [values.windFarmId, values.companyId, values.roleType, values.equitySharePct]
  );

  if (existing.rowCount > 0) {
    await client.query(
      `
      UPDATE wind_farm_ownership
      SET
        data_quality = $2,
        confidence = $3,
        source_title = $4,
        source_url = $5,
        updated_at = now()
      WHERE id = $1
      `,
      [
        existing.rows[0].id,
        values.dataQuality,
        values.confidence,
        values.sourceTitle,
        values.sourceUrl,
      ]
    );
    summary.skybornLinksUpdated += 1;
    return;
  }

  await client.query(
    `
    INSERT INTO wind_farm_ownership (
      wind_farm_id,
      company_id,
      equity_share_pct,
      role_type,
      is_current,
      data_quality,
      ingest_batch_id,
      confidence,
      source_url,
      source_title
    )
    VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
    `,
    [
      values.windFarmId,
      values.companyId,
      values.equitySharePct,
      values.roleType,
      values.dataQuality,
      summary.batchId,
      values.confidence,
      values.sourceUrl,
      values.sourceTitle,
    ]
  );
  summary.skybornLinksInserted += 1;
}

async function ensurePackage(client, windFarmId, packageCode, sourceTitle, sourceUrl, sourceDate, confidence, notes, summary) {
  const result = await client.query(
    `
    INSERT INTO wind_farm_epc_packages (
      wind_farm_id,
      package_code,
      package_status,
      confidence,
      source_title,
      source_url,
      source_date,
      notes
    )
    VALUES ($1, $2, 'awarded', $3, $4, $5, $6, $7)
    ON CONFLICT (wind_farm_id, package_code) DO UPDATE
    SET
      package_status = EXCLUDED.package_status,
      confidence = EXCLUDED.confidence,
      source_title = COALESCE(EXCLUDED.source_title, wind_farm_epc_packages.source_title),
      source_url = COALESCE(EXCLUDED.source_url, wind_farm_epc_packages.source_url),
      source_date = COALESCE(EXCLUDED.source_date, wind_farm_epc_packages.source_date),
      notes = COALESCE(EXCLUDED.notes, wind_farm_epc_packages.notes),
      updated_at = now()
    RETURNING xmax = 0 AS inserted
    `,
    [windFarmId, packageCode, confidence, sourceTitle, sourceUrl, sourceDate || null, notes || null]
  );

  if (result.rows[0]?.inserted) summary.epcPackagesInserted += 1;
  else summary.epcPackagesUpdated += 1;
}

async function upsertEpcRole(client, role, companyIds, farmIds, summary) {
  const companyId = companyIds.get(normalizedName(role.companyName));
  if (!companyId) {
    summary.skippedRows.push({ type: "missing-company", farmName: role.farmName, companyName: role.companyName });
    return;
  }

  const farmKey = `${role.countryCode}|${normalizedName(role.farmName)}`;
  const windFarmId = farmIds.get(farmKey);
  if (!windFarmId) {
    summary.skippedRows.push({ type: "missing-farm", farmName: role.farmName, companyName: role.companyName });
    return;
  }

  await ensurePackage(
    client,
    windFarmId,
    role.packageCode,
    role.sourceTitle,
    role.sourceUrl,
    role.sourceDate,
    role.confidence,
    role.notes,
    summary
  );

  const result = await client.query(
    `
    INSERT INTO wind_farm_epc_company_roles (
      wind_farm_id,
      company_id,
      package_code,
      role_type,
      is_current,
      contract_scope,
      confidence,
      provenance_note,
      source_url,
      source_title,
      source_date,
      notes
    )
    VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (wind_farm_id, company_id, package_code, role_type) DO UPDATE
    SET
      is_current = true,
      contract_scope = COALESCE(EXCLUDED.contract_scope, wind_farm_epc_company_roles.contract_scope),
      confidence = EXCLUDED.confidence,
      provenance_note = COALESCE(EXCLUDED.provenance_note, wind_farm_epc_company_roles.provenance_note),
      source_url = COALESCE(EXCLUDED.source_url, wind_farm_epc_company_roles.source_url),
      source_title = COALESCE(EXCLUDED.source_title, wind_farm_epc_company_roles.source_title),
      source_date = COALESCE(EXCLUDED.source_date, wind_farm_epc_company_roles.source_date),
      notes = COALESCE(EXCLUDED.notes, wind_farm_epc_company_roles.notes),
      updated_at = now()
    RETURNING xmax = 0 AS inserted
    `,
    [
      windFarmId,
      companyId,
      role.packageCode,
      role.roleType,
      role.contractScope,
      role.confidence,
      role.provenanceNote,
      role.sourceUrl,
      role.sourceTitle,
      role.sourceDate || null,
      role.notes,
    ]
  );

  summary.distinctLinkedContractors.add(companyId);
  if (result.rows[0]?.inserted) summary.epcRolesInserted += 1;
  else summary.epcRolesUpdated += 1;
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  await loadEnvFile(path.join(ROOT, ".env"));

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const csvRows = await readCsv(CSV_PATH);
  const contractorRows = csvRows
    .filter((row) => packageCodeFromCsv(row.package_group) && toBoolean(row.public_confirmed_flag))
    .map((row) => ({
      farmName: normalizeWhitespace(row.wind_farm_name),
      countryCode: countryCodeFromSource(row.country),
      companyName: canonicalCompanyName(row.company_name),
      packageCode: packageCodeFromCsv(row.package_group),
      roleType: normalizeWhitespace(row.role_type),
      confidence: normalizeWhitespace(row.confidence).toLowerCase(),
      contractScope: normalizeWhitespace(row.package_subscope) || null,
      provenanceNote: [normalizeWhitespace(row.source_type), normalizeWhitespace(row.phase), normalizeWhitespace(row.consortium_or_jv)]
        .filter(Boolean)
        .join(" | ") || null,
      sourceTitle: normalizeWhitespace(row.source_title),
      sourceUrl: normalizeWhitespace(row.source_url),
      sourceDate: normalizeWhitespace(row.source_date) || null,
      notes: normalizeWhitespace(row.notes) || null,
    }))
    .filter((row) => row.countryCode);

  const pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  const summary = {
    batchId: null,
    companiesInserted: 0,
    companiesUpdated: 0,
    companyLocationsInserted: 0,
    companyLocationsUpdated: 0,
    skybornFarmsInserted: 0,
    skybornFarmsUpdated: 0,
    skybornLinksInserted: 0,
    skybornLinksUpdated: 0,
    epcPackagesInserted: 0,
    epcPackagesUpdated: 0,
    epcRolesInserted: 0,
    epcRolesUpdated: 0,
    skippedRows: [],
    distinctLinkedContractors: new Set(),
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const batchMeta = [
      BATCH_NAME,
      "Public EPC contractor research and Skyborn portfolio backfill",
      "contractor_package_research_2026-04-02.csv + Skyborn public sources",
      "Backfills missing EPC contractor companies/roles, adds Skyborn-linked wind farms including Gennaker and Nordergründe, and refreshes company map points.",
    ];

    const existingBatch = await client.query(
      `SELECT id FROM ingest_batches WHERE batch_name = $1 LIMIT 1`,
      [BATCH_NAME]
    );

    if (existingBatch.rowCount > 0) {
      summary.batchId = existingBatch.rows[0].id;
      await client.query(
        `
        UPDATE ingest_batches
        SET
          source_name = $2,
          source_file_name = $3,
          notes = $4
        WHERE id = $1
        `,
        [summary.batchId, batchMeta[1], batchMeta[2], batchMeta[3]]
      );
    } else {
      const batchResult = await client.query(
        `
        INSERT INTO ingest_batches (batch_name, source_name, source_file_name, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        batchMeta
      );
      summary.batchId = batchResult.rows[0].id;
    }

    const requiredCompanies = new Set([
      "Skyborn Renewables",
      ...contractorRows.map((row) => row.companyName),
      ...GENNAKER_EPC_ROWS.map((row) => row.companyName),
      ...EXTRA_EPC_ROWS.map((row) => row.companyName),
    ]);

    const companyIds = new Map();
    for (const companyName of requiredCompanies) {
      const companyId = await upsertCompany(client, companyName, summary);
      companyIds.set(normalizedName(companyName), companyId);
    }

    const skybornId = companyIds.get(normalizedName("Skyborn Renewables"));
    if (!skybornId) {
      throw new Error("Failed to resolve Skyborn Renewables company ID");
    }

    const farmIds = new Map();
    const farmRows = await client.query(
      `
      SELECT id, country_code, normalized_name
      FROM wind_farms
      `
    );
    for (const row of farmRows.rows) {
      farmIds.set(`${row.country_code}|${row.normalized_name}`, row.id);
    }

    for (const farm of SKYBORN_PROJECTS) {
      const id = await ensureSkybornFarm(client, farm, skybornId, summary);
      farmIds.set(`${farm.countryCode}|${normalizedName(farm.name)}`, id);

      await upsertOwnershipLink(
        client,
        {
          windFarmId: id,
          companyId: skybornId,
          equitySharePct: null,
          roleType: "developer",
          dataQuality: "unverified",
          confidence: "confirmed",
          sourceTitle: farm.sourceTitle,
          sourceUrl: farm.sourceUrl,
        },
        summary
      );
    }

    for (const link of SKYBORN_PORTFOLIO_LINKS) {
      const farmId = farmIds.get(`${link.countryCode}|${normalizedName(link.farmName)}`);
      if (!farmId) {
        summary.skippedRows.push({ type: "missing-skyborn-farm", farmName: link.farmName, companyName: "Skyborn Renewables" });
        continue;
      }

      await upsertOwnershipLink(
        client,
        {
          windFarmId: farmId,
          companyId: skybornId,
          equitySharePct: link.equitySharePct,
          roleType: link.roleType,
          dataQuality: "unverified",
          confidence: link.confidence,
          sourceTitle: link.sourceTitle,
          sourceUrl: link.sourceUrl,
        },
        summary
      );
    }

    for (const role of contractorRows) {
      await upsertEpcRole(client, role, companyIds, farmIds, summary);
    }

    for (const role of GENNAKER_EPC_ROWS) {
      await upsertEpcRole(client, role, companyIds, farmIds, summary);
    }

    for (const role of EXTRA_EPC_ROWS) {
      await upsertEpcRole(client, role, companyIds, farmIds, summary);
    }

    const contractorCountResult = await client.query(
      `
      SELECT count(DISTINCT company_id) AS contractor_count
      FROM wind_farm_epc_company_roles
      `
    );

    await client.query(
      `
      UPDATE ingest_batches
      SET row_count = $2
      WHERE id = $1
      `,
      [
        summary.batchId,
        summary.epcRolesInserted + summary.epcRolesUpdated + summary.skybornLinksInserted + summary.skybornFarmsInserted,
      ]
    );

    await client.query("COMMIT");

    const report = {
      generated_at: new Date().toISOString(),
      batch_name: BATCH_NAME,
      companies_inserted: summary.companiesInserted,
      companies_updated: summary.companiesUpdated,
      company_locations_inserted: summary.companyLocationsInserted,
      company_locations_updated: summary.companyLocationsUpdated,
      skyborn_farms_inserted: summary.skybornFarmsInserted,
      skyborn_farms_updated: summary.skybornFarmsUpdated,
      skyborn_links_inserted: summary.skybornLinksInserted,
      skyborn_links_updated: summary.skybornLinksUpdated,
      epc_packages_inserted: summary.epcPackagesInserted,
      epc_packages_updated: summary.epcPackagesUpdated,
      epc_roles_inserted: summary.epcRolesInserted,
      epc_roles_updated: summary.epcRolesUpdated,
      distinct_epc_contractors_total: Number(contractorCountResult.rows[0]?.contractor_count ?? 0),
      distinct_epc_contractors_touched: summary.distinctLinkedContractors.size,
      skipped_rows: summary.skippedRows,
    };

    await writeJson(REPORT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
