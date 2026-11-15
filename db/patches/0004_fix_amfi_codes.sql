-- Correct AMFI scheme codes verified against AMFI/mfapi on 15 Nov 2026.
UPDATE public.instruments SET amfi_code = '119775', name = 'Kotak Midcap Fund (formerly Emerging Equity) - Direct Plan - Growth' WHERE symbol = 'KOTAK-MC' AND amfi_code IS DISTINCT FROM '119775';
UPDATE public.instruments SET amfi_code = '120465', name = 'Axis Large Cap Fund (formerly Bluechip) - Direct Plan - Growth' WHERE symbol = 'AXIS-BC' AND amfi_code IS DISTINCT FROM '120465';
UPDATE public.instruments SET amfi_code = '118825' WHERE symbol = 'MIRAE-LC' AND amfi_code IS DISTINCT FROM '118825';

-- Correct mutual fund ISINs (growth option, direct plan) verified against AMFI scheme metadata.
UPDATE public.instruments SET isin = 'INF879O01027' WHERE symbol = 'PPFAS-FC' AND isin IS DISTINCT FROM 'INF879O01027';
UPDATE public.instruments SET isin = 'INF846K01DP8' WHERE symbol = 'AXIS-BC' AND isin IS DISTINCT FROM 'INF846K01DP8';
UPDATE public.instruments SET isin = 'INF789F01XA0' WHERE symbol = 'UTI-N50' AND isin IS DISTINCT FROM 'INF789F01XA0';
UPDATE public.instruments SET isin = 'INF174K01LT0' WHERE symbol = 'KOTAK-MC' AND isin IS DISTINCT FROM 'INF174K01LT0';
UPDATE public.instruments SET isin = 'INF769K01AX2' WHERE symbol = 'MIRAE-LC' AND isin IS DISTINCT FROM 'INF769K01AX2';
UPDATE public.instruments SET isin = 'INF179K01XQ0' WHERE symbol = 'HDFC-MF' AND isin IS DISTINCT FROM 'INF179K01XQ0';
UPDATE public.instruments SET isin = 'INF200K01T51' WHERE symbol = 'SBI-SC' AND isin IS DISTINCT FROM 'INF200K01T51';
UPDATE public.instruments SET isin = 'INF247L01718' WHERE symbol = 'MO-N100' AND isin IS DISTINCT FROM 'INF247L01718';
