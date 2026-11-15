from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .models import ContactRateLimit


def allow_contact(ip):
    """Atomically reserve an attempt in a shared, fixed ten-minute window."""
    now = timezone.now()
    key = ip or '0.0.0.0'
    ContactRateLimit.objects.get_or_create(ip_address=key, defaults={'window_start': now})
    ContactRateLimit.objects.filter(
        ip_address=key,
        window_start__lte=now - timedelta(seconds=settings.CONTACT_RATE_WINDOW),
    ).update(window_start=now, count=0)
    return bool(ContactRateLimit.objects.filter(
        ip_address=key, count__lt=settings.CONTACT_RATE_LIMIT,
    ).update(count=F('count') + 1))
