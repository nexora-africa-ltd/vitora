<!--
What this file is for:
- Hub operator runbook for reinstall/recovery, sync recovery, and common permission issues.

How to use it:
- Run commands in order on the hub host (Windows PowerShell examples below).

Supported args/inputs:
- Replace YOUR_USERNAME where indicated.
- Assumes commands run from the hub project root with venv available.
-->

# Hub Admin Runbook

## Post-Reinstall Recovery (Hub)

1. Check hub identity and tenant scope

```powershell
.\venv\Scripts\python.exe manage.py shell -c "from django.conf import settings; print('HUB_ID=', getattr(settings,'HUB_ID','')); print('FACILITY=', getattr(settings,'HUB_FACILITY_ID','')); print('ORG=', getattr(settings,'HUB_ORGANIZATION_ID',''))"
```

2. Sync role matrix to Django permissions (prevents 403 drift)

```powershell
.\venv\Scripts\python.exe manage.py sync_role_permissions
```

3. Pull cloud snapshot first (no push)

```powershell
.\venv\Scripts\python.exe manage.py hub_sync --pull-only --full-pull
```

4. Retry deferred/failed materialization dependencies

```powershell
.\venv\Scripts\python.exe manage.py hub_sync --retry-failed
```

5. Check queue health

```powershell
.\venv\Scripts\python.exe manage.py shell -c "from django.db.models import Count; from hmis.apps.core.models import SyncQueue; print('PENDING:', SyncQueue.objects.filter(status='PENDING').count()); print('FAILED:', SyncQueue.objects.filter(status='FAILED').count()); print(list(SyncQueue.objects.filter(status='FAILED').values('model_name').annotate(c=Count('id')).order_by('-c')[:10]))"
```

6. If FAILED rows are only stale identity collisions, clear just those

```powershell
.\venv\Scripts\python.exe manage.py shell -c "from hmis.apps.core.models import SyncQueue; q=SyncQueue.objects.filter(status='FAILED', model_name__in=['core.StaffProfile','core.OrgMembership']); print('deleting', q.count()); q.delete()"
```

7. Resume normal sync cycle

```powershell
.\venv\Scripts\python.exe manage.py hub_sync
```

## DICOM Viewer 403 (Forbidden) on Desktop

When logs show `Forbidden: /api/imaging/dicom/{sop_uid}/`, auth succeeded but RBAC denied read.

1. Re-sync role permissions

```powershell
.\venv\Scripts\python.exe manage.py sync_role_permissions
```

2. Verify user has DICOM read permissions

```powershell
.\venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model; u=get_user_model().objects.get(username='YOUR_USERNAME'); print('view_dicominstance=',u.has_perm('imaging.view_dicominstance')); print('view_dicomstudy=',u.has_perm('imaging.view_dicomstudy'))"
```

3. If still false, grant temporary permission and re-login

```powershell
.\venv\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model; from django.contrib.auth.models import Permission; u=get_user_model().objects.get(username='YOUR_USERNAME'); u.user_permissions.add(Permission.objects.get(codename='view_dicomstudy')); print('granted')"
```

## Notes

- `python-magic is not installed` warning is non-blocking for sync.
- For full-pull issues, always deploy backend sync fixes to cloud API first; hub only consumes `/api/sync/pull/`.
