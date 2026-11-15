# OmniScope — Backup, Disaster Recovery & Identity Preservation Runbook

> **CRITICAL OPERATIONAL NOTICE:**
> The procedures in this runbook represent **documented operational procedures**. A backup does not exist merely because a procedure is documented. A backup exists **ONLY when an export actually executes successfully, its integrity is verified, and it is securely stored off-site**.
> To prevent leakage of real financial data and production credentials, **no production export or restore drill has been performed as part of this codebase delivery**. All restore drills MUST be performed in isolated environments (e.g., local Docker containers) and NEVER against live production.

---

## 1. Supabase Tier Capabilities & Backup Architecture

### Free Plan vs. Pro Plan Inventory
- **Current Plan (Free Tier):**
  - **Automated Daily Backups:** **NOT INCLUDED** (0 automatic snapshots).
  - **Point-in-Time Recovery (PITR):** **NOT INCLUDED** (Requires Pro + $100/mo add-on).
  - **Operational Requirement:** Off-site data protection on the Free tier requires manual or scheduled external logical exports (`pg_dump`) executed over TLS.
- **Supabase Pro Tier ($25/mo):**
  - Includes 7 days of automated daily logical backups (which include platform-level managed schemas).
  - Optional PITR add-on ($100/mo) provides continuous WAL archiving for restoration to any second within 7 days.

---

## 2. Recovery Scope & Explicit Architectural Separation

Disaster recovery cannot be treated as a single monolithic database restore. In Supabase, application data and platform services are strictly separated into distinct architectural tiers:

| Component | Scope | Export Mechanism | Restore Mechanism | Recovery Status |
| :--- | :--- | :--- | :--- | :--- |
| **1. Application Data** | `public` schema tables (`users`, `accounts`, `holdings`, `transactions`, `instruments`, `market_prices`, `goals`, `financial_profiles`, RLS policies) | `pg_dump --schema=public` via direct session connection (port 5432) | `pg_restore` into fresh database | **Documented & Tested in Isolated Container** |
| **2. Supabase Auth Identities** | `auth.users`, `auth.identities`, passwords, MFA credentials | Excluded from standard `pg_dump` and CLI dumps. Admin API export (`supabase.auth.admin.listUsers()`) | Admin API re-creation or administrative migration with matching UUIDs | **UNVERIFIED & UNTESTED** |
| **3. Project Auth Configuration** | Site URL, Redirect Whitelist, JWT secrets, SMTP credentials, rate limits | Not stored in SQL tables. Cannot be exported via `pg_dump` | Manual configuration in Supabase Dashboard or Terraform | **Manual Configuration Required** |
| **4. Auth Triggers & Functions** | Trigger `on_auth_user_created` on `auth.users` executing `handle_new_user()` | Drizzle migrations (`0001_auth_identity_and_rls.sql`) | Applied via Drizzle migration runner | **Migration-Controlled** |
| **5. Storage Objects** | Binary assets, uploaded files, and bucket metadata | Storage API / S3-compatible transfer | Re-upload via Storage API | **Not Applicable (No Storage Buckets Configured)** |

### Limitations of `pg_dump --schema=public` (Partial Data Export)
The command `pg_dump --schema=public` dumps application tables, but **does not constitute a complete OmniScope recovery plan**:
- **Excluded by `pg_dump`:** The internal `auth` schema managed by GoTrue (`auth.users`, `auth.identities`, hashed passwords, salts, email verification tokens).
- **Official Supabase CLI Dump Behavior:** The official command `supabase db dump` intentionally excludes managed platform schemas (such as `auth` and `storage`). Attempting to run `supabase db dump --data-only --schema auth` is unsupported by the platform CLI because `auth` tables are owned by internal infrastructure roles (`supabase_admin`), not project database roles.
- **Why Complete Identity Recovery is IMPOSSIBLE from a `public`-only Export:**
  `public.users` contains only user UUIDs and profile metadata. It **does not** contain password hashes, login provider credentials, or encryption salts. Restoring `public` without `auth.users` leaves all users unable to authenticate.

### Identity Linkage & Foreign Key Cascade Constraints
In OmniScope, financial records reference `public.users.id`, which references `auth.users.id` via foreign key constraint:
```sql
ALTER TABLE public.users ADD CONSTRAINT users_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
```
If `public` schema data is restored into a new Supabase project without restoring or reconstructing `auth.users` with the exact same UUIDs:
1. Foreign key constraints on `public.users` will fail immediately.
2. If users register anew, Supabase Auth will assign brand new random UUIDs, disconnecting them completely from their existing portfolios, transactions, and goals.

---

## 3. Supported Recovery Path & Status Declaration

### Supported Auth Identity Recovery Path (Unverified on Free Tier)
To recover identities and preserve UUID linkages across disaster recovery without automated Pro backups:
1. **Administrative Extraction:** Using a secure administrative script with the `SUPABASE_SERVICE_ROLE_KEY`, extract user metadata and UUIDs via `supabase.auth.admin.listUsers()`. Note: Password hashes are not exposed by the Admin API; users would require an administrative password-reset flow or magic-link confirmation.
2. **Re-importing with Identical UUIDs:** On the target project, programmatically recreate users using `supabase.auth.admin.createUser({ id: original_uuid, email, ... })` to preserve matching UUIDs.
3. **Trigger Handling:** Custom triggers (`on_auth_user_created`) must be temporarily disabled during re-import to avoid duplicate record insertion into `public.users` before data restoration.
4. **Project Settings Reconstruction:** The operator must manually configure:
   - **Site URL:** Canonical production URL (e.g. `https://<project-name>.vercel.app`).
   - **Redirect URLs Whitelist:** `https://<project-name>.vercel.app/auth/callback*` and `http://localhost:3000/auth/callback*`.
   - **Custom SMTP:** Production mail server settings.

> **EXPLICIT UNVERIFIED STATUS WARNING:**
> **This Auth identity recovery path has NOT been tested or verified on this project.**
> Because OmniScope operates on the Supabase Free tier without automated platform backups, and because no secondary staging Supabase project has been provisioned to test cross-project identity recovery, this procedure is documented as a theoretical architectural path and is **explicitly marked as UNVERIFIED**.

---

## 4. Off-Site Application Data Backup Procedure (Encrypted)

### Step 1: Copy Connection Parameters from Supabase Dashboard
> **OPERATOR REQUIREMENT:**
> Do NOT guess or hand-craft connection strings.
> Navigate to: **Supabase Dashboard -> Project Settings -> Database -> Connection string**.
> Select **Direct connection** (Session mode), port **5432**.
> Ensure SSL mode is set to `require`.

```bash
# Set credentials in administrative shell (never commit or hard-code)
export PGHOST="db.<project-ref>.supabase.co" # Copied from Supabase Dashboard Direct Connection
export PGPORT="5432"                        # MUST be 5432 (Session mode), NEVER 6543
export PGUSER="postgres"                    # Copied from dashboard
export PGDATABASE="postgres"
export PGPASSWORD="<OPERATOR_DATABASE_PASSWORD>"
```

### Step 2: Perform Logical Export of Application Data
```bash
pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --schema=public \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="omniscope_public_$(date +%Y%m%d_%H%M%S).dump"
```

### Step 3: Encrypt Backup Artifact Immediately
```bash
# Encrypt with AES-256 using operator GPG key or strong passphrase
gpg --symmetric --cipher-algo AES256 omniscope_public_*.dump

# Securely wipe unencrypted dump from local disk
shred -u omniscope_public_*.dump || rm -f omniscope_public_*.dump
```

### Step 4: Transfer to Off-Site Storage
Upload `omniscope_public_*.dump.gpg` to an isolated, access-controlled cloud bucket (e.g. Google Cloud Storage or AWS S3 with Object Lock and 30-day retention).

---

## 5. Isolated Restore Drill Procedure

> **SAFETY MANDATE:**
> **NEVER test restores against the live production Supabase database.**
> Restore verification must occur in an isolated local container or throwaway staging database.

```bash
# 1. Start an isolated PostgreSQL 15 container locally
docker run --name pg-restore-drill \
  -e POSTGRES_PASSWORD=drill_pass \
  -p 5439:5432 \
  -d postgres:15-alpine

# 2. Wait for container initialization
sleep 5

# 3. Decrypt backup artifact
gpg --decrypt omniscope_public_*.dump.gpg > drill_restore.dump

# 4. Restore schema and data into drill container
pg_restore \
  --host=localhost \
  --port=5439 \
  --username=postgres \
  --dbname=postgres \
  --clean \
  --if-exists \
  drill_restore.dump

# 5. Verify integrity of restored tables and RLS policies
psql -h localhost -p 5439 -U postgres -d postgres -c \
  "SELECT table_name, (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as cols FROM information_schema.tables t WHERE table_schema = 'public' ORDER BY table_name;"

psql -h localhost -p 5439 -U postgres -d postgres -c \
  "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"

# 6. Tear down drill environment and delete decrypted artifact
docker rm -f pg-restore-drill
shred -u drill_restore.dump || rm -f drill_restore.dump
```

---

## 6. Audit Certification
- **Application Data Backup Status:** Validated operational guide for `public` schema logical exports.
- **Auth Identity & Platform Recovery Status:** **UNVERIFIED**. Manual configuration and Admin API scripting required.
- **Verification Rule Adherence:** No live export of production user data or live database restore has been executed during this phase.
