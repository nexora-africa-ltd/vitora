# Email Notifications Infrastructure - Implementation Guide

## Overview

This document outlines the backend infrastructure needed to implement email notifications for stock alerts in the Vitora HMIS pharmacy module.

## Requirements

Email notifications should be sent for critical stock alerts (out of stock, expired, critically expiring items) to configured recipients.

## Architecture

### Components Required

1. **Email Service Configuration**
2. **Celery Task Infrastructure**
3. **Email Templates**
4. **Notification Preferences**
5. **Notification History**

---

## 1. Email Service Configuration

### Django Settings (`hmis/settings/base.py`)

```python
# Email configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = env('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = env.int('EMAIL_PORT', default=587)
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=True)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='noreply@vitora.health')

# Email notification settings
ALERT_NOTIFICATION_ENABLED = env.bool('ALERT_NOTIFICATION_ENABLED', default=False)
ALERT_NOTIFICATION_FROM = env('ALERT_NOTIFICATION_FROM', default=DEFAULT_FROM_EMAIL)
```

### Environment Variables (`.env`)

```bash
# Email Settings
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=noreply@vitora.health

# Alert Notifications
ALERT_NOTIFICATION_ENABLED=True
ALERT_NOTIFICATION_FROM=alerts@vitora.health
```

---

## 2. Celery Task Infrastructure

### Install Celery Dependencies

Add to `pyproject.toml`:

```toml
[tool.poetry.dependencies]
celery = "^5.3.4"
redis = "^5.0.1"
django-celery-beat = "^2.5.0"
django-celery-results = "^2.5.1"
```

### Celery Configuration (`hmis/celery.py`)

Already exists - ensure it's properly configured.

### Email Notification Task (`hmis/apps/pharmacy/tasks.py`)

```python
"""
Celery tasks for pharmacy module.
"""

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone

from hmis.apps.pharmacy.models import AlertSettings, StockAlert


@shared_task
def send_alert_notification_email(alert_id: int) -> bool:
    """
    Send email notification for a stock alert.
    
    Args:
        alert_id: ID of the StockAlert to send notification for
        
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        alert = StockAlert.objects.select_related(
            'drug', 'batch'
        ).get(id=alert_id)
        
        settings_obj = AlertSettings.get_settings()
        
        # Check if email notifications are enabled
        if not settings_obj.enable_email_notifications:
            return False
        
        # Get recipient list
        recipients = [
            email.strip() 
            for email in settings_obj.notification_email_recipients.split(',')
            if email.strip()
        ]
        
        if not recipients:
            return False
        
        # Prepare email context
        context = {
            'alert': alert,
            'drug_name': alert.drug.get_display_name(),
            'alert_type': alert.get_alert_type_display(),
            'severity': alert.get_severity_display(),
            'message': alert.message,
            'batch_number': alert.batch.batch_number if alert.batch else None,
            'created_at': alert.created_at,
            'dashboard_url': f"{settings.SITE_URL}/pharmacy?tab=alerts",
        }
        
        # Render email template
        subject = f"[CRITICAL] Stock Alert: {context['drug_name']}"
        html_message = render_to_string(
            'pharmacy/emails/stock_alert_notification.html',
            context
        )
        text_message = render_to_string(
            'pharmacy/emails/stock_alert_notification.txt',
            context
        )
        
        # Send email
        send_mail(
            subject=subject,
            message=text_message,
            from_email=settings.ALERT_NOTIFICATION_FROM,
            recipient_list=recipients,
            html_message=html_message,
            fail_silently=False,
        )
        
        return True
        
    except Exception as e:
        # Log error
        print(f"Failed to send alert notification: {e}")
        return False


@shared_task
def send_daily_alert_digest() -> bool:
    """
    Send daily digest email with summary of unresolved alerts.
    
    Returns:
        bool: True if email sent successfully
    """
    try:
        settings_obj = AlertSettings.get_settings()
        
        if not settings_obj.enable_email_notifications:
            return False
        
        # Get unresolved alerts
        unresolved_alerts = StockAlert.objects.filter(
            is_resolved=False
        ).select_related('drug', 'batch')
        
        if not unresolved_alerts.exists():
            return True  # No alerts, nothing to send
        
        # Group by severity
        critical = unresolved_alerts.filter(severity='CRITICAL')
        high = unresolved_alerts.filter(severity='HIGH')
        medium = unresolved_alerts.filter(severity='MEDIUM')
        low = unresolved_alerts.filter(severity='LOW')
        
        recipients = [
            email.strip()
            for email in settings_obj.notification_email_recipients.split(',')
            if email.strip()
        ]
        
        if not recipients:
            return False
        
        context = {
            'critical_alerts': critical,
            'high_alerts': high,
            'medium_alerts': medium,
            'low_alerts': low,
            'total_count': unresolved_alerts.count(),
            'dashboard_url': f"{settings.SITE_URL}/pharmacy?tab=alerts",
        }
        
        subject = f"Daily Stock Alerts Digest - {unresolved_alerts.count()} Unresolved"
        html_message = render_to_string(
            'pharmacy/emails/alert_digest.html',
            context
        )
        text_message = render_to_string(
            'pharmacy/emails/alert_digest.txt',
            context
        )
        
        send_mail(
            subject=subject,
            message=text_message,
            from_email=settings.ALERT_NOTIFICATION_FROM,
            recipient_list=recipients,
            html_message=html_message,
            fail_silently=False,
        )
        
        return True
        
    except Exception as e:
        print(f"Failed to send alert digest: {e}")
        return False
```

### Celery Beat Schedule (Periodic Tasks)

Add to `hmis/celery.py`:

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    'send-daily-alert-digest': {
        'task': 'hmis.apps.pharmacy.tasks.send_daily_alert_digest',
        'schedule': crontab(hour=8, minute=0),  # Daily at 8 AM
    },
}
```

---

## 3. Email Templates

### Directory Structure

```
backend/hmis/apps/pharmacy/templates/pharmacy/emails/
├── stock_alert_notification.html
├── stock_alert_notification.txt
├── alert_digest.html
└── alert_digest.txt
```

### Critical Alert Template (`stock_alert_notification.html`)

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc2626; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .alert-details { background-color: white; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Critical Stock Alert</h1>
        </div>
        <div class="content">
            <p><strong>{{ severity }}</strong> alert has been generated for your pharmacy inventory:</p>
            
            <div class="alert-details">
                <h3>{{ drug_name }}</h3>
                <p><strong>Alert Type:</strong> {{ alert_type }}</p>
                <p><strong>Message:</strong> {{ message }}</p>
                {% if batch_number %}
                <p><strong>Batch Number:</strong> {{ batch_number }}</p>
                {% endif %}
                <p><strong>Time:</strong> {{ created_at|date:"F d, Y H:i" }}</p>
            </div>
            
            <p>Please take immediate action to resolve this alert.</p>
            
            <a href="{{ dashboard_url }}" class="button">View in Dashboard</a>
        </div>
        <div class="footer">
            <p>This is an automated notification from Vitora HMIS</p>
            <p>© 2026 Nexora Africa Ltd</p>
        </div>
    </div>
</body>
</html>
```

### Plain Text Version (`stock_alert_notification.txt`)

```
CRITICAL STOCK ALERT
===================

{{ severity }} alert has been generated for your pharmacy inventory:

Drug: {{ drug_name }}
Alert Type: {{ alert_type }}
Message: {{ message }}
{% if batch_number %}Batch Number: {{ batch_number }}{% endif %}
Time: {{ created_at|date:"F d, Y H:i" }}

Please take immediate action to resolve this alert.

View in Dashboard: {{ dashboard_url }}

---
This is an automated notification from Vitora HMIS
© 2026 Nexora Africa Ltd
```

---

## 4. Integration with Alert Creation

### Update StockAlert Model (`models.py`)

Add method to trigger email notification:

```python
def save(self, *args, **kwargs):
    """Override save to trigger email notification for critical alerts."""
    is_new = self.pk is None
    super().save(*args, **kwargs)
    
    # Send email notification for new critical alerts
    if is_new and self.severity == 'CRITICAL':
        from hmis.apps.pharmacy.tasks import send_alert_notification_email
        send_alert_notification_email.delay(self.id)
```

---

## 5. Testing

### Unit Tests (`tests/test_pharmacy_notifications.py`)

```python
from unittest.mock import patch

import pytest
from django.core import mail

from hmis.apps.pharmacy.models import AlertSettings, StockAlert
from hmis.apps.pharmacy.tasks import send_alert_notification_email


@pytest.mark.django_db
class TestAlertNotifications:
    
    def test_send_email_when_enabled(self, sample_drug, sample_batch):
        """Test email is sent when notifications are enabled."""
        # Setup
        settings = AlertSettings.get_settings()
        settings.enable_email_notifications = True
        settings.notification_email_recipients = 'admin@test.com'
        settings.save()
        
        alert = StockAlert.objects.create(
            drug=sample_drug,
            batch=sample_batch,
            alert_type='OUT_OF_STOCK',
            severity='CRITICAL',
            message='Test alert'
        )
        
        # Execute
        result = send_alert_notification_email(alert.id)
        
        # Assert
        assert result is True
        assert len(mail.outbox) == 1
        assert 'CRITICAL' in mail.outbox[0].subject
    
    def test_no_email_when_disabled(self, sample_drug, sample_batch):
        """Test no email is sent when notifications are disabled."""
        settings = AlertSettings.get_settings()
        settings.enable_email_notifications = False
        settings.save()
        
        alert = StockAlert.objects.create(
            drug=sample_drug,
            alert_type='OUT_OF_STOCK',
            severity='CRITICAL',
            message='Test alert'
        )
        
        result = send_alert_notification_email(alert.id)
        
        assert result is False
        assert len(mail.outbox) == 0
```

---

## 6. Deployment Checklist

- [ ] Install Redis server
- [ ] Configure email SMTP settings
- [ ] Set environment variables
- [ ] Install Celery dependencies
- [ ] Create email templates directory
- [ ] Run migrations
- [ ] Start Celery worker: `celery -A hmis worker -l info`
- [ ] Start Celery beat: `celery -A hmis beat -l info`
- [ ] Test email configuration with Django shell
- [ ] Configure monitoring for Celery tasks
- [ ] Set up error logging and alerting

---

## 7. Future Enhancements

1. **User-specific preferences**: Allow individual users to configure their notification preferences
2. **Notification channels**: Add SMS, Slack, or WhatsApp notifications
3. **Alert grouping**: Group related alerts to avoid email spam
4. **Notification history**: Track all sent notifications in database
5. **Email templates admin**: Allow admins to customize email templates
6. **Unsubscribe functionality**: Add ability to unsubscribe from specific alert types

---

## Estimated Effort

- **Backend Development**: 2-3 days
- **Email Template Design**: 1 day
- **Testing**: 1-2 days
- **Documentation**: 0.5 day
- **Deployment & Configuration**: 0.5 day

**Total**: 5-7 days

---

## Dependencies

- Django email backend
- Celery 5.3+
- Redis (as Celery broker)
- django-celery-beat
- django-celery-results

---

*Document Version: 1.0*  
*Created: 2026-01-09*  
*Author: Copilot (GitHub)*
