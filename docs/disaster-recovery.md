# Disaster Recovery Plan

> **Vitora HMIS Disaster Recovery Runbook**
>
> Version: 1.0
> Created: February 22, 2026
> Last Updated: February 22, 2026
> Owner: DevOps Team
> DHA Compliance Reference: § 4.3 - Business Continuity Requirements

---

## Recovery Objectives

| Metric | Target | Justification |
|--------|--------|---------------|
| **RTO (Recovery Time Objective)** | 4 hours | Maximum acceptable downtime for clinical operations |
| **RPO (Recovery Point Objective)** | 1 hour | Maximum acceptable data loss (hourly backups during business hours) |
| **MTTR (Mean Time To Recovery)** | 2 hours | Target average recovery time |

---

## Backup Strategy

### Backup Schedule

| Type | Frequency | Retention | Storage |
|------|-----------|-----------|---------|
| **Full Database Backup** | Daily @ 02:00 EAT | 30 days local, 90 days S3 | Encrypted (AES-256) |
| **Hourly Incremental** | Every hour (08:00-18:00 EAT) | 7 days | Local + S3 |
| **Transaction Logs** | Continuous (WAL archiving) | 7 days | S3 |
| **Media Files** | Weekly | 30 days | S3 |
| **Configuration** | On change | Unlimited | Git |

### Backup Locations

| Location | Type | Encryption | Access |
|----------|------|------------|--------|
| `/var/backups/vitora/` | Local | GPG (AES-256) | Root only |
| `s3://vitora-backups/backups/` | Off-site (Wasabi EU) | At-rest + GPG | IAM restricted |
| GitHub (private repo) | Config/Code | At-rest | Team access |

### Encryption

All backups are encrypted using GPG with AES-256 symmetric encryption. The encryption key is:
- Stored in HashiCorp Vault (production)
- Environment variable `BACKUP_ENCRYPTION_KEY` (staging)
- Rotated annually
- Known only to: CTO, Lead DevOps, Security Officer

---

## Disaster Scenarios & Recovery Procedures

### Scenario 1: Database Corruption

**Symptoms:**
- Application errors referencing database integrity
- PostgreSQL logs showing corruption errors
- Inconsistent query results

**Recovery Steps:**

1. **Assess Impact**
   ```bash
   # Check PostgreSQL logs
   tail -100 /var/log/postgresql/postgresql-15-main.log
   
   # Check for corruption
   sudo -u postgres pg_catalog.pg_database_check('vitora_hmis')
   ```

2. **Stop Application**
   ```bash
   # On Render: Use dashboard or CLI
   render services suspend vitora-api
   
   # Self-hosted
   systemctl stop vitora-api
   ```

3. **Create Current State Backup (if possible)**
   ```bash
   cd /path/to/backend/scripts
   ./backup.sh --env production --db-only 2>&1 | tee /tmp/emergency-backup.log
   ```

4. **Restore from Last Known Good Backup**
   ```bash
   # List available backups
   ./restore.sh --list
   
   # Restore latest verified backup
   ./restore.sh --latest
   
   # Or restore specific backup
   ./restore.sh /var/backups/vitora/vitora_production_20260222_020000_db.sql.gz.gpg
   ```

5. **Apply Transaction Logs (if available)**
   ```bash
   # For PostgreSQL WAL recovery
   pg_restore --target-time="2026-02-22 14:00:00" ...
   ```

6. **Verify Data Integrity**
   ```bash
   # Run Django checks
   cd /path/to/backend
   python manage.py check
   python manage.py dbshell <<< "SELECT COUNT(*) FROM patients_patient;"
   ```

7. **Restart Application**
   ```bash
   render services resume vitora-api
   # Or: systemctl start vitora-api
   ```

8. **Notify Stakeholders**
   - Update status page
   - Email clinical staff
   - Create incident report

**Estimated Recovery Time:** 1-2 hours

---

### Scenario 2: Complete Server Loss (Render)

**Symptoms:**
- Service unreachable
- Render dashboard shows service deleted/unavailable
- DNS resolution fails

**Recovery Steps:**

1. **Confirm Outage**
   ```bash
   curl -I https://vitora-api.onrender.com/api/health/
   # Should return 502/503 or connection refused
   ```

2. **Check Render Status**
   - Visit: https://status.render.com
   - Contact Render support if platform-wide issue

3. **Deploy New Instance from Blueprint**
   ```bash
   # Option A: Render Dashboard
   # 1. Go to render.com/dashboard
   # 2. Click "New Blueprint Instance"
   # 3. Select vitora repo, branch: main
   # 4. Deploy
   
   # Option B: Render CLI
   render blueprint launch --name vitora-recovery --repo nexora-africa-ltd/vitora
   ```

4. **Restore Database**
   ```bash
   # Get new DATABASE_URL from Render dashboard
   export DATABASE_URL="postgres://..."
   
   # Download and restore from S3
   cd /path/to/backend/scripts
   ./restore.sh --from-s3 s3://vitora-backups/backups/production/vitora_production_LATEST_db.sql.gz.gpg
   ```

5. **Update DNS (if custom domain)**
   ```bash
   # Update A/CNAME records to point to new Render service
   # TTL should be low (300s) for faster propagation
   ```

6. **Restore Media Files**
   ```bash
   aws s3 sync s3://vitora-backups/media/ /path/to/backend/media/
   ```

7. **Verify Deployment**
   ```bash
   curl https://vitora-api.onrender.com/api/health/
   # Should return {"status": "healthy"}
   ```

**Estimated Recovery Time:** 2-4 hours

---

### Scenario 3: Ransomware/Security Breach

**Symptoms:**
- Encrypted files with ransom notes
- Unauthorized data access in audit logs
- Unusual API activity

**Recovery Steps:**

1. **ISOLATE IMMEDIATELY**
   ```bash
   # Suspend all services
   render services suspend vitora-api
   render services suspend vitora
   
   # Revoke all API tokens
   # (From admin panel or directly in database)
   ```

2. **Preserve Evidence**
   ```bash
   # Create forensic snapshot
   ./backup.sh --env production --full-state
   
   # Export audit logs
   python manage.py export_audit_logs --since "2026-02-20" > /secure/audit_export.json
   ```

3. **Notify Required Parties**
   - ODPC (within 72 hours per Kenya DPA 2019)
   - Affected healthcare facilities
   - Legal counsel
   - SHA (if claims data affected)

4. **Determine Clean Recovery Point**
   ```bash
   # Review backup manifests for pre-breach backup
   ls -la /var/backups/vitora/*_manifest.json
   
   # Check audit logs for first sign of breach
   grep -l "suspicious_action" /var/log/vitora/*.log
   ```

5. **Deploy Fresh Environment**
   ```bash
   # Create new infrastructure with rotated credentials
   render blueprint launch --name vitora-clean --repo nexora-africa-ltd/vitora
   
   # Generate new secrets
   export NEW_DJANGO_SECRET=$(openssl rand -base64 32)
   export NEW_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
   ```

6. **Restore from Pre-Breach Backup**
   ```bash
   ./restore.sh --verify /path/to/pre_breach_backup.gpg
   ./restore.sh /path/to/pre_breach_backup.gpg
   ```

7. **Re-encrypt All Sensitive Data**
   ```bash
   python manage.py rotate_encryption_keys
   ```

8. **Conduct Security Review**
   - Audit all user accounts
   - Review and reset all passwords
   - Enable MFA for all users
   - Update security patches

**Estimated Recovery Time:** 24-72 hours

---

### Scenario 4: Region-Wide Outage

**Symptoms:**
- Multiple services unavailable
- Cloud provider status page shows regional issues
- Geographic-specific DNS failures

**Recovery Steps:**

1. **Confirm Regional Scope**
   - Check: status.render.com, status.aws.amazon.com
   - Verify from multiple geographic locations

2. **Activate Secondary Region (if configured)**
   ```bash
   # Update DNS to point to secondary region
   # Secondary region should have:
   # - Read replica database
   # - Synced media files
   # - Pre-deployed application
   ```

3. **If No Secondary Region:**
   - Wait for provider recovery
   - Communicate estimated downtime to users
   - Prepare for rapid deployment once region recovers

4. **Post-Recovery:**
   - Verify data consistency between regions
   - Sync any transactions from failover period
   - Document lessons learned

**Estimated Recovery Time:** Provider-dependent (2-24 hours)

---

## Recovery Verification Checklist

After any recovery, complete this checklist:

### System Health

- [ ] API health endpoint returns 200: `curl /api/health/`
- [ ] Database connections working: `python manage.py dbshell <<< "SELECT 1;"`
- [ ] All migrations applied: `python manage.py showmigrations`
- [ ] Static files accessible
- [ ] Media files accessible

### Data Integrity

- [ ] Patient count matches expected: `SELECT COUNT(*) FROM patients_patient;`
- [ ] Recent encounters present: `SELECT MAX(created_at) FROM encounters_encounter;`
- [ ] Audit logs intact: `SELECT COUNT(*) FROM core_auditlog;`
- [ ] No orphaned records: Run `python manage.py check_data_integrity`

### Security

- [ ] All secrets rotated (if security incident)
- [ ] MFA enabled for admin accounts
- [ ] Audit logging active
- [ ] SSL certificates valid

### External Integrations

- [ ] SHA API connectivity
- [ ] KHIS/DHIS2 connectivity (if applicable)
- [ ] Email notifications working
- [ ] SMS gateway working (if applicable)

---

## Backup Scripts Reference

### Daily Backup

```bash
# Full database backup with encryption and S3 upload
./backup.sh --env production

# Database only (no S3)
./backup.sh --env production --db-only --skip-s3

# Include media files
./backup.sh --env production --media
```

### Restore Operations

```bash
# List available backups
./restore.sh --list

# Verify backup integrity
./restore.sh --verify /path/to/backup.gpg

# Restore latest backup
./restore.sh --latest

# Restore specific backup
./restore.sh /var/backups/vitora/vitora_production_20260222_020000_db.sql.gz.gpg

# Restore from S3
./restore.sh --from-s3 s3://vitora-backups/backups/production/backup.gpg

# Dry run (show what would happen)
./restore.sh --dry-run --latest
```

### Cron Configuration

```cron
# /etc/cron.d/vitora-backup

# Daily full backup at 2 AM EAT
0 2 * * * root /opt/vitora/backend/scripts/backup.sh --env production >> /var/log/vitora-backup.log 2>&1

# Hourly incremental during business hours
0 8-18 * * 1-5 root /opt/vitora/backend/scripts/backup.sh --env production --incremental >> /var/log/vitora-backup.log 2>&1

# Weekly media backup on Sunday
0 3 * * 0 root /opt/vitora/backend/scripts/backup.sh --env production --media >> /var/log/vitora-backup.log 2>&1

# Backup monitoring check every 6 hours
0 */6 * * * root /opt/vitora/backend/scripts/backup_monitor.py >> /var/log/vitora-backup-monitor.log 2>&1
```

---

## Contact Information

### Internal Escalation

| Role | Contact | Response Time |
|------|---------|---------------|
| On-Call DevOps | +254 XXX XXX XXX | 15 minutes |
| DevOps Lead | +254 XXX XXX XXX | 30 minutes |
| CTO | +254 XXX XXX XXX | 1 hour |

### External Support

| Vendor | Support Channel | SLA |
|--------|-----------------|-----|
| Render | support@render.com | 4 hours (paid plans) |
| Wasabi | support@wasabi.com | 24 hours |
| PostgreSQL | community forums | Best effort |

### Regulatory Notifications

| Entity | Contact | Requirement |
|--------|---------|-------------|
| ODPC | compliance@odpc.go.ke | 72 hours (data breach) |
| MOH | ehealth@health.go.ke | Per incident severity |

---

## DR Testing Schedule

| Test Type | Frequency | Last Tested | Next Test |
|-----------|-----------|-------------|-----------|
| Backup Verification | Weekly | — | — |
| Restore to Staging | Monthly | — | — |
| Full DR Drill | Quarterly | — | — |
| Tabletop Exercise | Semi-annually | — | — |

### DR Drill Procedure

1. Schedule 4-hour maintenance window
2. Create fresh environment from blueprint
3. Restore from S3 backup
4. Run verification checklist
5. Document timing and issues
6. Update runbook based on findings

---

## Appendix A: Environment Variables

Required environment variables for backup/restore scripts:

```bash
# Database
DATABASE_URL=postgres://user:pass@host:port/dbname

# Encryption
BACKUP_ENCRYPTION_KEY=32-byte-gpg-passphrase

# S3/Wasabi Storage
S3_BUCKET=vitora-backups
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_ENDPOINT=https://s3.eu-central-1.wasabisys.com  # For Wasabi

# Alerting
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
ALERT_EMAIL=devops@nexora.africa

# Environment
VITORA_ENV=production
```

---

## Appendix B: Recovery Runbook Quick Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VITORA DR QUICK REFERENCE CARD                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔴 DATABASE CORRUPTION                                                     │
│     1. Stop app: render services suspend vitora-api                        │
│     2. Restore:  ./restore.sh --latest                                     │
│     3. Verify:   python manage.py check                                    │
│     4. Resume:   render services resume vitora-api                         │
│                                                                             │
│  🔴 COMPLETE SERVER LOSS                                                    │
│     1. Deploy:   render blueprint launch --name vitora-recovery            │
│     2. Restore:  ./restore.sh --from-s3 s3://vitora-backups/...           │
│     3. DNS:      Update records to new service                             │
│                                                                             │
│  🔴 SECURITY BREACH                                                         │
│     1. Isolate:  Suspend ALL services immediately                          │
│     2. Preserve: Export audit logs, create forensic backup                 │
│     3. Notify:   ODPC within 72 hours, Legal, affected facilities         │
│     4. Deploy:   Fresh environment with rotated credentials               │
│     5. Restore:  From pre-breach backup                                    │
│                                                                             │
│  📞 ESCALATION: DevOps On-Call → DevOps Lead → CTO                         │
│                                                                             │
│  ⏱️  RTO: 4 hours | RPO: 1 hour                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-22 | DevOps Team | Initial DR runbook |

---

*This document must be reviewed and updated quarterly, or immediately after any DR event.*
