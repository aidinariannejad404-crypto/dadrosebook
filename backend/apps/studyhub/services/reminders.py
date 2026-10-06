"""SMS study-reminder consent (د۳). Only the flag is stored; sending is out of scope for now."""

from __future__ import annotations

from django.utils import timezone

from ..models import StudyReminderConsent


def state(user) -> dict:
    obj = StudyReminderConsent.objects.filter(user=user).first()
    return {
        "sms": bool(obj and obj.sms),
        "consented_at": obj.consented_at.isoformat()
        if obj and obj.sms and obj.consented_at
        else None,
    }


def set_consent(user, sms: bool, *, source: str = "") -> StudyReminderConsent:
    """Opt in or out. Opting in again refreshes ``consented_at``; opting out keeps the history."""
    if source not in StudyReminderConsent.Source.values:
        source = ""
    obj, _ = StudyReminderConsent.objects.get_or_create(user=user)
    now = timezone.now()
    if sms:
        if not obj.sms:
            obj.consented_at = now
        obj.withdrawn_at = None
    elif obj.sms:
        obj.withdrawn_at = now
    obj.sms = sms
    if source:
        obj.source = source
    obj.save()
    return obj
