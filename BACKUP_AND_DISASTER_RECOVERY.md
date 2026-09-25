# Database Backup, Disaster Recovery & High-Availability Plan

## 1. Overview & Service Level Objectives (SLO)

Fruitful Journey utilizes **Neon Lakebase PostgreSQL**, a serverless cloud Postgres architecture with storage and compute separation, continuous write-ahead log (WAL) archiving, and instant copy-on-write branching.

| Metric | Target | Method |
|---|---|---|
| **Recovery Point Objective (RPO)** | **< 60 seconds** | Continuous WAL streaming & Neon PITR |
| **Recovery Time Objective (RTO)** | **< 5 minutes** | Instant zero-copy branch promotion & compute spin-up |
| **Data Retention** | **30 days** | Automated WAL retention & weekly cold snapshots |
| **Failover Mechanism** | **Automated / Instant switch** | Connection pooling string failover |

---

## 2. Backup Mechanisms

### A. Continuous Write-Ahead Log (WAL) Archiving & PITR
- Every committed database transaction is streamed continuously from compute to Neon's multi-AZ distributed storage layers.
- **Point-In-Time-Recovery (PITR)**: Enables rolling back or restoring the database to any millisecond within the retention window.

### B. Instant Zero-Copy Branch Backups
- Neon branches act as instantaneous, byte-identical snapshots at a specific Log Sequence Number (LSN).
- Creating a backup branch does not duplicate disk space (copy-on-write) and takes less than 3 seconds.
- Current active baseline backup:
  - **Branch Name**: `backup-mvp-launch`
  - **Branch ID**: `br-broad-truth-b4wyphr5`
  - **Parent LSN**: `0/1FF2D18`
  - **Parent Branch**: `production` (`br-jolly-grass-b4qw6pje`)

### C. Periodic Scheduled Backups
For regulatory and offsite redundancy:
- **Daily Automated Branch Snapshot**: Captured before scheduled maintenance windows.
- **Weekly Logical Backups (`pg_dump`)**: Automated dump of schemas and data encrypted at rest (AES-256) and archived to secure object storage.

---

## 3. Disaster Recovery & Emergency Runbook

### Scenario 1: Accidental Data Corruption or Erroneous Migration
If a bad migration or data mutation corrupts tables on the `production` branch:

1. **Identify Corruption Timestamp**:
   Determine the exact UTC timestamp before the bad transaction occurred (e.g. `2026-09-25T00:30:00Z`).

2. **Create Recovery Branch via Neon CLI**:
   ```bash
   neon branches create \
     --project-id tiny-shadow-80215415 \
     --parent production \
     --name recovery-pitr-rollback \
     --timestamp "2026-09-25T00:30:00Z"
   ```

3. **Verify Recovered Data**:
   Connect to the recovery branch and run validation queries:
   ```sql
   SELECT count(*) FROM "user";
   SELECT count(*) FROM "job";
   SELECT count(*) FROM "jobApplication";
   ```

4. **Promote Recovery Branch to Production**:
   ```bash
   neon branches set-default \
     --project-id tiny-shadow-80215415 \
     --branch recovery-pitr-rollback
   ```

5. **Update Application Connection String**:
   Update `DATABASE_URL` in production environment to the promoted branch endpoint.

---

### Scenario 2: Instant Rollback to Pre-Deployment Checkpoint
Before deploying major schema migrations:

1. **Create Pre-Deployment Checkpoint**:
   ```bash
   neon branches create \
     --project-id tiny-shadow-80215415 \
     --parent production \
     --name pre-deploy-checkpoint-$(date +%Y%m%d%H%M) \
     --no-compute
   ```

2. **If Deployment Fails**:
   Promote `pre-deploy-checkpoint` or reset the production branch state:
   ```bash
   neon branches reset-from-parent \
     --project-id tiny-shadow-80215415 \
     --branch production \
     --parent-branch pre-deploy-checkpoint
   ```

---

## 4. Logical Export Script (`pg_dump`)

For offline disaster recovery, run the following automated backup script:

```bash
#!/bin/bash
# scripts/backup-database.sh
set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/fruitful_prod_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "Starting logical database backup..."
pg_dump "${DATABASE_URL_UNPOOLED}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"

echo "Backup completed successfully: ${BACKUP_FILE}"
gzip -9 "${BACKUP_FILE}"
```

---

## 5. Security & Verification Testing

- **Quarterly Drill**: Conduct recovery verification drills every quarter by restoring a PITR branch and verifying data integrity against automated integration test suites.
- **Encryption at Rest & In-Transit**: All database storage volumes are encrypted using LUKS (AES-256), and connections strictly enforce SSL/TLS 1.3 (`sslmode=require`).
