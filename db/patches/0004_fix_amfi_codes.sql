-- Correct AMFI scheme codes verified against AMFI/mfapi on 15 Nov 2026.
UPDATE public.instruments SET amfi_code = '119775', name = 'Kotak Midcap Fund (formerly Emerging Equity) - Direct Plan - Growth' WHERE symbol = 'KOTAK-MC' AND amfi_code IS DISTINCT FROM '119775';
UPDATE public.instruments SET amfi_code = '120465', name = 'Axis Large Cap Fund (formerly Bluechip) - Direct Plan - Growth' WHERE symbol = 'AXIS-BC' AND amfi_code IS DISTINCT FROM '120465';
UPDATE public.instruments SET amfi_code = '118825' WHERE symbol = 'MIRAE-LC' AND amfi_code IS DISTINCT FROM '118825';
