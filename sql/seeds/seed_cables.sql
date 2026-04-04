INSERT INTO cables (
  name,
  cable_type,
  status,
  voltage_kv,
  capacity_mw,
  length_km,
  owner,
  connected_farm_id,
  route,
  landing_points,
  source_url
)
VALUES
  ('BorWin1', 'export_cable', 'operational', 400, 400, 200, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.18 53.58, 7.1 53.88, 6.94 54.22, 6.74 54.56)'), ST_GeogFromText('MULTIPOINT(7.18 53.58, 6.74 54.56)'), 'https://www.tennet.eu/projects/borwin1'),
  ('BorWin2', 'export_cable', 'operational', 320, 800, 200, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.22 53.6, 7.16 53.9, 7.02 54.25, 6.84 54.62)'), ST_GeogFromText('MULTIPOINT(7.22 53.6, 6.84 54.62)'), 'https://www.tennet.eu/projects/borwin2'),
  ('BorWin3', 'export_cable', 'operational', 320, 900, 160, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.26 53.62, 7.18 53.94, 7.06 54.28, 6.92 54.66)'), ST_GeogFromText('MULTIPOINT(7.26 53.62, 6.92 54.66)'), 'https://www.tennet.eu/projects/borwin3'),
  ('BorWin4', 'export_cable', 'planned', 525, 900, 125, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.3 53.64, 7.22 53.96, 7.08 54.3, 6.96 54.72)'), ST_GeogFromText('MULTIPOINT(7.3 53.64, 6.96 54.72)'), 'https://www.tennet.eu/projects/borwin4'),
  ('BorWin5', 'export_cable', 'planned', 525, 900, 130, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.34 53.66, 7.24 54, 7.1 54.34, 7 54.76)'), ST_GeogFromText('MULTIPOINT(7.34 53.66, 7 54.76)'), 'https://www.tennet.eu/projects/borwin5'),
  ('DolWin1', 'export_cable', 'operational', 320, 800, 165, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.14 53.64, 7.06 53.94, 6.9 54.24, 6.72 54.52)'), ST_GeogFromText('MULTIPOINT(7.14 53.64, 6.72 54.52)'), 'https://www.tennet.eu/projects/dolwin1'),
  ('DolWin2', 'export_cable', 'operational', 320, 900, 140, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.1 53.66, 7 53.96, 6.86 54.22, 6.68 54.48)'), ST_GeogFromText('MULTIPOINT(7.1 53.66, 6.68 54.48)'), 'https://www.tennet.eu/projects/dolwin2'),
  ('DolWin3', 'export_cable', 'operational', 320, 900, 160, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.06 53.68, 6.96 53.98, 6.82 54.26, 6.62 54.56)'), ST_GeogFromText('MULTIPOINT(7.06 53.68, 6.62 54.56)'), 'https://www.tennet.eu/projects/dolwin3'),
  ('DolWin4', 'export_cable', 'planned', 525, 900, 140, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.02 53.7, 6.92 54, 6.78 54.3, 6.58 54.6)'), ST_GeogFromText('MULTIPOINT(7.02 53.7, 6.58 54.6)'), 'https://www.tennet.eu/projects/dolwin4'),
  ('DolWin5', 'export_cable', 'planned', 525, 900, 145, 'TenneT', NULL, ST_GeogFromText('LINESTRING(6.98 53.72, 6.88 54.02, 6.74 54.32, 6.54 54.64)'), ST_GeogFromText('MULTIPOINT(6.98 53.72, 6.54 54.64)'), 'https://www.tennet.eu/projects/dolwin5'),
  ('DolWin6', 'export_cable', 'planned', 525, 900, 150, 'TenneT', NULL, ST_GeogFromText('LINESTRING(6.94 53.74, 6.82 54.04, 6.68 54.36, 6.48 54.7)'), ST_GeogFromText('MULTIPOINT(6.94 53.74, 6.48 54.7)'), 'https://www.tennet.eu/projects/dolwin6'),
  ('HelWin1', 'export_cable', 'operational', 576, 576, 130, 'TenneT', NULL, ST_GeogFromText('LINESTRING(8.66 54.16, 8.56 54.42, 8.4 54.7, 8.24 55.02)'), ST_GeogFromText('MULTIPOINT(8.66 54.16, 8.24 55.02)'), 'https://www.tennet.eu/projects/helwin1'),
  ('HelWin2', 'export_cable', 'operational', 690, 690, 135, 'TenneT', NULL, ST_GeogFromText('LINESTRING(8.74 54.14, 8.62 54.42, 8.46 54.68, 8.3 54.96)'), ST_GeogFromText('MULTIPOINT(8.74 54.14, 8.3 54.96)'), 'https://www.tennet.eu/projects/helwin2'),
  ('SylWin1', 'export_cable', 'operational', 864, 864, 160, 'TenneT', NULL, ST_GeogFromText('LINESTRING(8.86 54.14, 8.72 54.48, 8.44 54.92, 8.12 55.42)'), ST_GeogFromText('MULTIPOINT(8.86 54.14, 8.12 55.42)'), 'https://www.tennet.eu/projects/sylwin1'),
  ('Hornsea 1 Export Cable', 'export_cable', 'operational', 220, 1200, 170, 'Ørsted', NULL, ST_GeogFromText('LINESTRING(1.82 53.68, 1.28 53.46, 0.82 53.18, 0.32 52.92)'), ST_GeogFromText('MULTIPOINT(1.82 53.68, 0.32 52.92)'), 'https://hornseaprojectone.co.uk/'),
  ('Hornsea 2 Export Cable', 'export_cable', 'operational', 220, 1320, 190, 'Ørsted', NULL, ST_GeogFromText('LINESTRING(1.96 53.92, 1.42 53.62, 0.94 53.3, 0.46 52.98)'), ST_GeogFromText('MULTIPOINT(1.96 53.92, 0.46 52.98)'), 'https://hornseaprojecttwo.co.uk/'),
  ('Walney Extension Export Cable', 'export_cable', 'operational', 220, 659, 90, 'Ørsted', NULL, ST_GeogFromText('LINESTRING(-3.84 54.28, -3.62 54.1, -3.38 53.92, -3.14 53.74)'), ST_GeogFromText('MULTIPOINT(-3.84 54.28, -3.14 53.74)'), 'https://orsted.com/en/our-business/offshore-wind/our-projects/walney-extension'),
  ('East Anglia ONE Export Cable', 'export_cable', 'operational', 220, 714, 85, 'ScottishPower Renewables', NULL, ST_GeogFromText('LINESTRING(1.62 52.96, 1.44 52.8, 1.2 52.62, 1.06 52.48)'), ST_GeogFromText('MULTIPOINT(1.62 52.96, 1.06 52.48)'), 'https://www.scottishpowerrenewables.com/pages/east_anglia_one.aspx'),
  ('Hollandse Kust Zuid Export Cable', 'export_cable', 'operational', 220, 1500, 60, 'TenneT', NULL, ST_GeogFromText('LINESTRING(3.28 52.74, 3.56 52.46, 3.82 52.18, 4.1 51.9)'), ST_GeogFromText('MULTIPOINT(3.28 52.74, 4.1 51.9)'), 'https://www.tennet.eu/projects/hollandse-kust-zuid'),
  ('Hollandse Kust Noord Export Cable', 'export_cable', 'operational', 220, 759, 55, 'TenneT', NULL, ST_GeogFromText('LINESTRING(3.74 52.96, 4.04 52.72, 4.32 52.46, 4.62 52.22)'), ST_GeogFromText('MULTIPOINT(3.74 52.96, 4.62 52.22)'), 'https://www.tennet.eu/projects/hollandse-kust-noord'),
  ('Kriegers Flak Interconnector', 'interconnector', 'operational', 400, 400, 170, 'Energinet / 50Hertz', NULL, ST_GeogFromText('LINESTRING(12.86 54.78, 13.18 54.94, 13.52 55.06, 13.92 55.16)'), ST_GeogFromText('MULTIPOINT(12.86 54.78, 13.92 55.16)'), 'https://energinet.dk/Anlaeg-og-projekter/Projektliste/Kriegers-Flak-Combined-Grid-Solution'),
  ('NordLink', 'interconnector', 'operational', 525, 1400, 623, 'Statnett / TenneT', NULL, ST_GeogFromText('LINESTRING(8.66 54.16, 8.02 55.16, 7.24 56.36, 6.56 58.14)'), ST_GeogFromText('MULTIPOINT(8.66 54.16, 6.56 58.14)'), 'https://www.tennet.eu/projects/nordlink'),
  ('NorNed', 'interconnector', 'operational', 450, 700, 580, 'Statnett / TenneT', NULL, ST_GeogFromText('LINESTRING(6.84 53.44, 6.18 55.18, 5.82 56.96, 6.54 58.39)'), ST_GeogFromText('MULTIPOINT(6.84 53.44, 6.54 58.39)'), 'https://www.tennet.eu/projects/norned'),
  ('BritNed', 'interconnector', 'operational', 450, 1000, 260, 'BritNed Development Ltd', NULL, ST_GeogFromText('LINESTRING(1.32 51.96, 2.02 52.08, 2.98 52.12, 3.62 51.92)'), ST_GeogFromText('MULTIPOINT(1.32 51.96, 3.62 51.92)'), 'https://www.britned.com/'),
  ('Viking Link', 'interconnector', 'operational', 525, 1400, 765, 'National Grid / Energinet', NULL, ST_GeogFromText('LINESTRING(0.22 53.64, 2.02 54.08, 4.96 54.74, 8.54 55.42)'), ST_GeogFromText('MULTIPOINT(0.22 53.64, 8.54 55.42)'), 'https://www.viking-link.com/'),
  ('COBRAcable', 'interconnector', 'operational', 320, 700, 325, 'TenneT / Energinet', NULL, ST_GeogFromText('LINESTRING(6.84 53.44, 7.12 54.06, 7.72 54.78, 8.46 55.48)'), ST_GeogFromText('MULTIPOINT(6.84 53.44, 8.46 55.48)'), 'https://www.cobracable.com/'),
  ('OstWind 1', 'export_cable', 'operational', 220, 250, 90, '50Hertz', NULL, ST_GeogFromText('LINESTRING(13.82 54.52, 13.94 54.72, 14.08 54.88, 14.22 55.02)'), ST_GeogFromText('MULTIPOINT(13.82 54.52, 14.22 55.02)'), 'https://www.50hertz.com/en/Grid/Gridprojects/Ostwind1'),
  ('OstWind 2', 'export_cable', 'under construction', 220, 750, 110, '50Hertz', NULL, ST_GeogFromText('LINESTRING(13.88 54.5, 14.02 54.7, 14.18 54.9, 14.34 55.08)'), ST_GeogFromText('MULTIPOINT(13.88 54.5, 14.34 55.08)'), 'https://www.50hertz.com/en/Grid/Gridprojects/Ostwind2'),
  ('OstWind 3', 'export_cable', 'planned', 220, 300, 120, '50Hertz', NULL, ST_GeogFromText('LINESTRING(13.94 54.48, 14.12 54.68, 14.3 54.9, 14.46 55.12)'), ST_GeogFromText('MULTIPOINT(13.94 54.48, 14.46 55.12)'), 'https://www.50hertz.com/en/Grid/Gridprojects/Ostwind3'),
  ('Gode Wind Export Cable', 'export_cable', 'operational', 220, 582, 105, 'TenneT', NULL, ST_GeogFromText('LINESTRING(7.08 53.66, 6.98 53.96, 6.88 54.2, 6.8 54.46)'), ST_GeogFromText('MULTIPOINT(7.08 53.66, 6.8 54.46)'), 'https://www.tennet.eu/projects/gode-wind-connection')
ON CONFLICT ((lower(name)), (lower(cable_type))) DO UPDATE
SET
  status = EXCLUDED.status,
  voltage_kv = EXCLUDED.voltage_kv,
  capacity_mw = EXCLUDED.capacity_mw,
  length_km = EXCLUDED.length_km,
  owner = EXCLUDED.owner,
  route = EXCLUDED.route,
  landing_points = EXCLUDED.landing_points,
  source_url = EXCLUDED.source_url,
  updated_at = now();

UPDATE cables
SET
  shore_connection_name = 'Norderney Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.1438175 53.7056126)'),
  offshore_connection_name = 'BorWin Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(6.0250083 54.35417)'),
  route = ST_GeogFromText('LINESTRING(7.1438175 53.7056126, 6.94 53.96, 6.56 54.18, 6.0250083 54.35417)')
WHERE name = 'BorWin1';

UPDATE cables
SET
  shore_connection_name = 'Norderney Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.1438175 53.7056126)'),
  offshore_connection_name = 'BorWin Beta',
  offshore_connection_point = ST_GeogFromText('POINT(6.22 54.44)'),
  route = ST_GeogFromText('LINESTRING(7.1438175 53.7056126, 6.98 53.98, 6.68 54.24, 6.22 54.44)')
WHERE name = 'BorWin2';

UPDATE cables
SET
  shore_connection_name = 'Norderney Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.1438175 53.7056126)'),
  offshore_connection_name = 'BorWin Gamma',
  offshore_connection_point = ST_GeogFromText('POINT(6.48 54.56)'),
  route = ST_GeogFromText('LINESTRING(7.1438175 53.7056126, 7 54.02, 6.76 54.3, 6.48 54.56)')
WHERE name = 'BorWin3';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'BorWin Delta',
  offshore_connection_point = ST_GeogFromText('POINT(6.62 54.66)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 7.06 54.02, 6.84 54.34, 6.62 54.66)')
WHERE name = 'BorWin4';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'BorWin Epsilon',
  offshore_connection_point = ST_GeogFromText('POINT(6.82 54.76)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 7.12 54.04, 6.92 54.38, 6.82 54.76)')
WHERE name = 'BorWin5';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(6.72 54.52)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 7.08 53.96, 6.9 54.24, 6.72 54.52)')
WHERE name = 'DolWin1';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Beta',
  offshore_connection_point = ST_GeogFromText('POINT(6.68 54.48)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 7.02 53.94, 6.84 54.18, 6.68 54.48)')
WHERE name = 'DolWin2';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Gamma',
  offshore_connection_point = ST_GeogFromText('POINT(6.62 54.56)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 6.98 53.98, 6.82 54.24, 6.62 54.56)')
WHERE name = 'DolWin3';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Delta',
  offshore_connection_point = ST_GeogFromText('POINT(6.58 54.6)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 6.94 54, 6.76 54.28, 6.58 54.6)')
WHERE name = 'DolWin4';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Epsilon',
  offshore_connection_point = ST_GeogFromText('POINT(6.54 54.64)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 6.9 54.02, 6.72 54.32, 6.54 54.64)')
WHERE name = 'DolWin5';

UPDATE cables
SET
  shore_connection_name = 'Hilgenriedersiel Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.2862685 53.6646304)'),
  offshore_connection_name = 'DolWin Zeta',
  offshore_connection_point = ST_GeogFromText('POINT(6.48 54.7)'),
  route = ST_GeogFromText('LINESTRING(7.2862685 53.6646304, 6.86 54.04, 6.68 54.36, 6.48 54.7)')
WHERE name = 'DolWin6';

UPDATE cables
SET
  shore_connection_name = 'Buesum Landfall',
  shore_connection_point = ST_GeogFromText('POINT(8.8586989 54.1298489)'),
  offshore_connection_name = 'HelWin Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(8.24 55.02)'),
  route = ST_GeogFromText('LINESTRING(8.8586989 54.1298489, 8.74 54.38, 8.52 54.66, 8.24 55.02)')
WHERE name = 'HelWin1';

UPDATE cables
SET
  shore_connection_name = 'Buesum Landfall',
  shore_connection_point = ST_GeogFromText('POINT(8.8586989 54.1298489)'),
  offshore_connection_name = 'HelWin Beta',
  offshore_connection_point = ST_GeogFromText('POINT(8.3 54.96)'),
  route = ST_GeogFromText('LINESTRING(8.8586989 54.1298489, 8.76 54.36, 8.54 54.62, 8.3 54.96)')
WHERE name = 'HelWin2';

UPDATE cables
SET
  shore_connection_name = 'Buesum Landfall',
  shore_connection_point = ST_GeogFromText('POINT(8.8586989 54.1298489)'),
  offshore_connection_name = 'SylWin Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(8.12 55.42)'),
  route = ST_GeogFromText('LINESTRING(8.8586989 54.1298489, 8.7 54.46, 8.4 54.92, 8.12 55.42)')
WHERE name = 'SylWin1';

UPDATE cables
SET
  shore_connection_name = 'Horseshoe Point Landfall',
  shore_connection_point = ST_GeogFromText('POINT(0.152 53.412)'),
  offshore_connection_name = 'Hornsea 1 Offshore Substation',
  offshore_connection_point = ST_GeogFromText('POINT(1.82 53.68)'),
  route = ST_GeogFromText('LINESTRING(1.82 53.68, 1.2 53.55, 0.7 53.34, 0.152 53.412)')
WHERE name = 'Hornsea 1 Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Horseshoe Point Landfall',
  shore_connection_point = ST_GeogFromText('POINT(0.152 53.412)'),
  offshore_connection_name = 'Hornsea 2 Offshore Substation',
  offshore_connection_point = ST_GeogFromText('POINT(1.96 53.92)'),
  route = ST_GeogFromText('LINESTRING(1.96 53.92, 1.42 53.72, 0.86 53.54, 0.152 53.412)')
WHERE name = 'Hornsea 2 Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Heysham Landfall',
  shore_connection_point = ST_GeogFromText('POINT(-2.890311 54.0494955)'),
  offshore_connection_name = 'Walney Extension Offshore Substation',
  offshore_connection_point = ST_GeogFromText('POINT(-3.84 54.28)'),
  route = ST_GeogFromText('LINESTRING(-3.84 54.28, -3.55 54.23, -3.18 54.14, -2.890311 54.0494955)')
WHERE name = 'Walney Extension Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Bawdsey Landfall',
  shore_connection_point = ST_GeogFromText('POINT(1.4193577 52.0094318)'),
  offshore_connection_name = 'East Anglia ONE Offshore Substation',
  offshore_connection_point = ST_GeogFromText('POINT(1.62 52.96)'),
  route = ST_GeogFromText('LINESTRING(1.62 52.96, 1.56 52.66, 1.48 52.34, 1.4193577 52.0094318)')
WHERE name = 'East Anglia ONE Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Maasvlakte Landfall',
  shore_connection_point = ST_GeogFromText('POINT(4.0197987 51.9543525)'),
  offshore_connection_name = 'Hollandse Kust Zuid Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(3.28 52.74)'),
  route = ST_GeogFromText('LINESTRING(3.28 52.74, 3.56 52.52, 3.82 52.28, 4.0197987 51.9543525)')
WHERE name = 'Hollandse Kust Zuid Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Beverwijk Landfall',
  shore_connection_point = ST_GeogFromText('POINT(4.6728396 52.4787896)'),
  offshore_connection_name = 'Hollandse Kust Noord Alpha',
  offshore_connection_point = ST_GeogFromText('POINT(3.74 52.96)'),
  route = ST_GeogFromText('LINESTRING(3.74 52.96, 4.08 52.84, 4.38 52.66, 4.6728396 52.4787896)')
WHERE name = 'Hollandse Kust Noord Export Cable';

UPDATE cables
SET
  shore_connection_name = 'Kriegers Flak West Platform',
  shore_connection_point = ST_GeogFromText('POINT(12.86 54.78)'),
  offshore_connection_name = 'Kriegers Flak East Platform',
  offshore_connection_point = ST_GeogFromText('POINT(13.92 55.16)')
WHERE name = 'Kriegers Flak Interconnector';

UPDATE cables
SET
  shore_connection_name = 'Buesum Landfall',
  shore_connection_point = ST_GeogFromText('POINT(8.8586989 54.1298489)'),
  offshore_connection_name = 'Tonstad Coastal Connection',
  offshore_connection_point = ST_GeogFromText('POINT(6.8186187 58.2665247)'),
  route = ST_GeogFromText('LINESTRING(8.8586989 54.1298489, 8.3 55.08, 7.46 56.52, 6.8186187 58.2665247)')
WHERE name = 'NordLink';

UPDATE cables
SET
  shore_connection_name = 'Eemshaven',
  shore_connection_point = ST_GeogFromText('POINT(6.8465032 53.4484020)'),
  offshore_connection_name = 'Feda Coastal Connection',
  offshore_connection_point = ST_GeogFromText('POINT(6.8186187 58.2665247)'),
  route = ST_GeogFromText('LINESTRING(6.8465032 53.4484020, 6.32 54.92, 6.16 56.46, 6.8186187 58.2665247)')
WHERE name = 'NorNed';

UPDATE cables
SET
  shore_connection_name = 'Isle of Grain',
  shore_connection_point = ST_GeogFromText('POINT(0.6979607 51.4540158)'),
  offshore_connection_name = 'Maasvlakte',
  offshore_connection_point = ST_GeogFromText('POINT(4.0197987 51.9543525)'),
  route = ST_GeogFromText('LINESTRING(0.6979607 51.4540158, 1.46 51.72, 2.78 51.92, 4.0197987 51.9543525)')
WHERE name = 'BritNed';

UPDATE cables
SET
  shore_connection_name = 'Lincolnshire Coast Landfall',
  shore_connection_point = ST_GeogFromText('POINT(0.22 53.64)'),
  offshore_connection_name = 'Jutland Landfall',
  offshore_connection_point = ST_GeogFromText('POINT(8.62 55.4)'),
  route = ST_GeogFromText('LINESTRING(0.22 53.64, 2.02 54.08, 5.02 54.84, 8.62 55.4)')
WHERE name = 'Viking Link';

UPDATE cables
SET
  shore_connection_name = 'Eemshaven',
  shore_connection_point = ST_GeogFromText('POINT(6.8465032 53.4484020)'),
  offshore_connection_name = 'Endrup',
  offshore_connection_point = ST_GeogFromText('POINT(8.7183108 55.5234974)'),
  route = ST_GeogFromText('LINESTRING(6.8465032 53.4484020, 7.22 53.94, 7.88 54.64, 8.7183108 55.5234974)')
WHERE name = 'COBRAcable';

UPDATE cables
SET
  shore_connection_name = 'Ruegen Coast Landfall',
  shore_connection_point = ST_GeogFromText('POINT(13.82 54.52)'),
  offshore_connection_name = 'OstWind 1 Platform',
  offshore_connection_point = ST_GeogFromText('POINT(14.22 55.02)')
WHERE name = 'OstWind 1';

UPDATE cables
SET
  shore_connection_name = 'Ruegen Coast Landfall',
  shore_connection_point = ST_GeogFromText('POINT(13.88 54.5)'),
  offshore_connection_name = 'OstWind 2 Platform',
  offshore_connection_point = ST_GeogFromText('POINT(14.34 55.08)')
WHERE name = 'OstWind 2';

UPDATE cables
SET
  shore_connection_name = 'Ruegen Coast Landfall',
  shore_connection_point = ST_GeogFromText('POINT(13.94 54.48)'),
  offshore_connection_name = 'OstWind 3 Platform',
  offshore_connection_point = ST_GeogFromText('POINT(14.46 55.12)')
WHERE name = 'OstWind 3';

UPDATE cables
SET
  shore_connection_name = 'Norderney Landfall',
  shore_connection_point = ST_GeogFromText('POINT(7.1438175 53.7056126)'),
  offshore_connection_name = 'Gode Wind Offshore Substation',
  offshore_connection_point = ST_GeogFromText('POINT(6.8 54.46)'),
  route = ST_GeogFromText('LINESTRING(7.1438175 53.7056126, 7.02 53.94, 6.9 54.18, 6.8 54.46)')
WHERE name = 'Gode Wind Export Cable';

-- Tighten a few farm centroids so farm-to-OSS links land on the actual project area.
UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(5.975 54.3583)'),
  geometry_quality = 'approximated'
WHERE name = 'BARD Offshore 1';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(7.68 54.43)'),
  geometry_quality = 'approximated'
WHERE name = 'Nordsee Ost';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(7.68 54.38)'),
  geometry_quality = 'approximated'
WHERE name = 'Meerwind Süd/Ost';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(7.7048 54.5227)'),
  geometry_quality = 'approximated'
WHERE name = 'Amrumbank West';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(6.814 53.979)'),
  geometry_quality = 'approximated'
WHERE name = 'Nordsee One';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(2.6286111111111112 52.907777777777774)'),
  geometry_quality = 'approximated'
WHERE name = 'East Anglia One';

UPDATE wind_farms
SET
  centroid = ST_GeogFromText('POINT(4.251 52.7151)'),
  geometry_quality = 'approximated'
WHERE name = 'Hollandse Kust Noord';

INSERT INTO cables (
  name,
  cable_type,
  status,
  voltage_kv,
  capacity_mw,
  length_km,
  owner,
  connected_farm_id,
  route,
  landing_points,
  source_url,
  offshore_connection_name,
  offshore_connection_point,
  shore_connection_name,
  shore_connection_point
)
VALUES
  (
    'BARD Offshore 1 OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    11,
    'BARD / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'BARD Offshore 1'),
    ST_GeogFromText('LINESTRING(5.975 54.3583, 6.005 54.36, 6.0250083 54.35417)'),
    ST_GeogFromText('MULTIPOINT(5.975 54.3583, 6.0250083 54.35417)'),
    'https://fr.wikipedia.org/wiki/BorWin1',
    'BorWin Alpha',
    ST_GeogFromText('POINT(6.0250083 54.35417)'),
    'BARD Offshore 1',
    ST_GeogFromText('POINT(5.975 54.3583)')
  ),
  (
    'Nordsee Ost OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    35,
    'RWE / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Nordsee Ost'),
    ST_GeogFromText('LINESTRING(7.68 54.43, 7.02 54.7, 8.24 55.02)'),
    ST_GeogFromText('MULTIPOINT(7.68 54.43, 8.24 55.02)'),
    'https://en.wikipedia.org/wiki/HVDC_HelWin1',
    'HelWin Alpha',
    ST_GeogFromText('POINT(8.24 55.02)'),
    'Nordsee Ost',
    ST_GeogFromText('POINT(7.68 54.43)')
  ),
  (
    'Meerwind Süd/Ost OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    30,
    'Meerwind / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Meerwind Süd/Ost'),
    ST_GeogFromText('LINESTRING(7.68 54.38, 7.88 54.68, 8.24 55.02)'),
    ST_GeogFromText('MULTIPOINT(7.68 54.38, 8.24 55.02)'),
    'https://en.wikipedia.org/wiki/HVDC_HelWin1',
    'HelWin Alpha',
    ST_GeogFromText('POINT(8.24 55.02)'),
    'Meerwind Süd/Ost',
    ST_GeogFromText('POINT(7.68 54.38)')
  ),
  (
    'Amrumbank West OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    34,
    'Amrumbank West / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Amrumbank West'),
    ST_GeogFromText('LINESTRING(7.7048 54.5227, 7.96 54.72, 8.3 54.96)'),
    ST_GeogFromText('MULTIPOINT(7.7048 54.5227, 8.3 54.96)'),
    'https://en.wikipedia.org/wiki/HVDC_HelWin2',
    'HelWin Beta',
    ST_GeogFromText('POINT(8.3 54.96)'),
    'Amrumbank West',
    ST_GeogFromText('POINT(7.7048 54.5227)')
  ),
  (
    'Gode Wind 1 OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    36,
    'Ørsted / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Gode Wind 1'),
    ST_GeogFromText('LINESTRING(7.05 54.03, 6.9 54.22, 6.68 54.48)'),
    ST_GeogFromText('MULTIPOINT(7.05 54.03, 6.68 54.48)'),
    'https://de.wikipedia.org/wiki/Offshore-Windpark_Gode_Wind_I',
    'DolWin Beta',
    ST_GeogFromText('POINT(6.68 54.48)'),
    'Gode Wind 1',
    ST_GeogFromText('POINT(7.05 54.03)')
  ),
  (
    'Gode Wind 2 OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    35,
    'Ørsted / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Gode Wind 2'),
    ST_GeogFromText('LINESTRING(7.1 54.02, 6.94 54.2, 6.68 54.48)'),
    ST_GeogFromText('MULTIPOINT(7.1 54.02, 6.68 54.48)'),
    'https://de.wikipedia.org/wiki/Offshore-Windpark_Gode_Wind_I',
    'DolWin Beta',
    ST_GeogFromText('POINT(6.68 54.48)'),
    'Gode Wind 2',
    ST_GeogFromText('POINT(7.1 54.02)')
  ),
  (
    'Nordsee One OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    28,
    'Northland / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Nordsee One'),
    ST_GeogFromText('LINESTRING(6.814 53.979, 6.76 54.18, 6.68 54.48)'),
    ST_GeogFromText('MULTIPOINT(6.814 53.979, 6.68 54.48)'),
    'https://de.wikipedia.org/wiki/Offshore-Windpark_Gode_Wind_I',
    'DolWin Beta',
    ST_GeogFromText('POINT(6.68 54.48)'),
    'Nordsee One',
    ST_GeogFromText('POINT(6.814 53.979)')
  ),
  (
    'EnBW Hohe See OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    25,
    'EnBW / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'EnBW Hohe See'),
    ST_GeogFromText('LINESTRING(5.97 54.45, 6.2 54.5, 6.48 54.56)'),
    ST_GeogFromText('MULTIPOINT(5.97 54.45, 6.48 54.56)'),
    'https://de.wikipedia.org/wiki/Offshore-Windpark_Deutsche_Bucht',
    'BorWin Gamma',
    ST_GeogFromText('POINT(6.48 54.56)'),
    'EnBW Hohe See',
    ST_GeogFromText('POINT(5.97 54.45)')
  ),
  (
    'Global Tech I OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    8,
    'Global Tech I / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Global Tech I'),
    ST_GeogFromText('LINESTRING(6.58 54.49, 6.54 54.52, 6.48 54.56)'),
    ST_GeogFromText('MULTIPOINT(6.58 54.49, 6.48 54.56)'),
    'https://de.wikipedia.org/wiki/Offshore-Windpark_Deutsche_Bucht',
    'BorWin Gamma',
    ST_GeogFromText('POINT(6.48 54.56)'),
    'Global Tech I',
    ST_GeogFromText('POINT(6.58 54.49)')
  ),
  (
    'Butendiek OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    39,
    'Butendiek / TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Butendiek'),
    ST_GeogFromText('LINESTRING(7.77 55.03, 7.94 55.18, 8.12 55.42)'),
    ST_GeogFromText('MULTIPOINT(7.77 55.03, 8.12 55.42)'),
    'https://en.wikipedia.org/wiki/SylWin1',
    'SylWin Alpha',
    ST_GeogFromText('POINT(8.12 55.42)'),
    'Butendiek',
    ST_GeogFromText('POINT(7.77 55.03)')
  ),
  (
    'Hornsea One OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    16,
    'Ørsted',
    (SELECT id FROM wind_farms WHERE name = 'Hornsea One'),
    ST_GeogFromText('LINESTRING(1.81 53.82, 1.81 53.74, 1.82 53.68)'),
    ST_GeogFromText('MULTIPOINT(1.81 53.82, 1.82 53.68)'),
    'https://hornseaprojectone.co.uk/',
    'Hornsea 1 Offshore Substation',
    ST_GeogFromText('POINT(1.82 53.68)'),
    'Hornsea One',
    ST_GeogFromText('POINT(1.81 53.82)')
  ),
  (
    'Hornsea Two OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    8,
    'Ørsted',
    (SELECT id FROM wind_farms WHERE name = 'Hornsea Two'),
    ST_GeogFromText('LINESTRING(1.82 53.96, 1.88 53.94, 1.96 53.92)'),
    ST_GeogFromText('MULTIPOINT(1.82 53.96, 1.96 53.92)'),
    'https://hornseaprojecttwo.co.uk/',
    'Hornsea 2 Offshore Substation',
    ST_GeogFromText('POINT(1.96 53.92)'),
    'Hornsea Two',
    ST_GeogFromText('POINT(1.82 53.96)')
  ),
  (
    'Walney Extension OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    20,
    'Ørsted',
    (SELECT id FROM wind_farms WHERE name = 'Walney Extension'),
    ST_GeogFromText('LINESTRING(-3.6 54.13, -3.72 54.18, -3.84 54.28)'),
    ST_GeogFromText('MULTIPOINT(-3.6 54.13, -3.84 54.28)'),
    'https://orsted.com/en/our-business/offshore-wind/our-projects/walney-extension',
    'Walney Extension Offshore Substation',
    ST_GeogFromText('POINT(-3.84 54.28)'),
    'Walney Extension',
    ST_GeogFromText('POINT(-3.6 54.13)')
  ),
  (
    'East Anglia One OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    68,
    'ScottishPower Renewables',
    (SELECT id FROM wind_farms WHERE name = 'East Anglia One'),
    ST_GeogFromText('LINESTRING(2.6286111111111112 52.907777777777774, 2.18 52.94, 1.62 52.96)'),
    ST_GeogFromText('MULTIPOINT(2.6286111111111112 52.907777777777774, 1.62 52.96)'),
    'https://www.scottishpowerrenewables.com/pages/east_anglia_one.aspx',
    'East Anglia ONE Offshore Substation',
    ST_GeogFromText('POINT(1.62 52.96)'),
    'East Anglia One',
    ST_GeogFromText('POINT(2.6286111111111112 52.907777777777774)')
  ),
  (
    'Hollandse Kust Zuid 1+2 OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    73,
    'TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Hollandse Kust Zuid 1+2'),
    ST_GeogFromText('LINESTRING(4.02 52.08, 3.8 52.34, 3.28 52.74)'),
    ST_GeogFromText('MULTIPOINT(4.02 52.08, 3.28 52.74)'),
    'https://www.tennet.eu/projects/hollandse-kust-zuid',
    'Hollandse Kust Zuid Alpha',
    ST_GeogFromText('POINT(3.28 52.74)'),
    'Hollandse Kust Zuid 1+2',
    ST_GeogFromText('POINT(4.02 52.08)')
  ),
  (
    'Hollandse Kust Noord OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    44,
    'TenneT',
    (SELECT id FROM wind_farms WHERE name = 'Hollandse Kust Noord'),
    ST_GeogFromText('LINESTRING(4.251 52.7151, 4.02 52.84, 3.74 52.96)'),
    ST_GeogFromText('MULTIPOINT(4.251 52.7151, 3.74 52.96)'),
    'https://www.tennet.eu/projects/hollandse-kust-noord',
    'Hollandse Kust Noord Alpha',
    ST_GeogFromText('POINT(3.74 52.96)'),
    'Hollandse Kust Noord',
    ST_GeogFromText('POINT(4.251 52.7151)')
  ),
  (
    'Kriegers Flak OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    11,
    'Vattenfall / Energinet',
    (SELECT id FROM wind_farms WHERE name = 'Kriegers Flak'),
    ST_GeogFromText('LINESTRING(12.77 54.97, 12.82 54.9, 12.86 54.78)'),
    ST_GeogFromText('MULTIPOINT(12.77 54.97, 12.86 54.78)'),
    'https://energinet.dk/Anlaeg-og-projekter/Projektliste/Kriegers-Flak-Combined-Grid-Solution',
    'Kriegers Flak West Platform',
    ST_GeogFromText('POINT(12.86 54.78)'),
    'Kriegers Flak',
    ST_GeogFromText('POINT(12.77 54.97)')
  ),
  (
    'Arkona OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    11,
    'Parkwind / 50Hertz',
    (SELECT id FROM wind_farms WHERE name = 'Arkona'),
    ST_GeogFromText('LINESTRING(14.12 54.97, 14.18 55.0, 14.22 55.02)'),
    ST_GeogFromText('MULTIPOINT(14.12 54.97, 14.22 55.02)'),
    'https://en.wikipedia.org/wiki/Ostwind',
    'OstWind 1 Platform',
    ST_GeogFromText('POINT(14.22 55.02)'),
    'Arkona',
    ST_GeogFromText('POINT(14.12 54.97)')
  ),
  (
    'Wikinger OSS Link',
    'inter_array',
    'operational',
    NULL,
    NULL,
    21,
    'Iberdrola / 50Hertz',
    (SELECT id FROM wind_farms WHERE name = 'Wikinger'),
    ST_GeogFromText('LINESTRING(14.07 54.84, 14.16 54.94, 14.22 55.02)'),
    ST_GeogFromText('MULTIPOINT(14.07 54.84, 14.22 55.02)'),
    'https://en.wikipedia.org/wiki/Ostwind',
    'OstWind 1 Platform',
    ST_GeogFromText('POINT(14.22 55.02)'),
    'Wikinger',
    ST_GeogFromText('POINT(14.07 54.84)')
  )
ON CONFLICT ((lower(name)), (lower(cable_type))) DO UPDATE
SET
  status = EXCLUDED.status,
  length_km = EXCLUDED.length_km,
  owner = EXCLUDED.owner,
  connected_farm_id = EXCLUDED.connected_farm_id,
  route = EXCLUDED.route,
  landing_points = EXCLUDED.landing_points,
  source_url = EXCLUDED.source_url,
  offshore_connection_name = EXCLUDED.offshore_connection_name,
  offshore_connection_point = EXCLUDED.offshore_connection_point,
  shore_connection_name = EXCLUDED.shore_connection_name,
  shore_connection_point = EXCLUDED.shore_connection_point,
  updated_at = now();
