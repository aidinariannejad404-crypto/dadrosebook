"""One small personal payload for the client chrome (bell badge, library tab, continue card,
onboarding sheet), fetched in the browser so the catalog and home pages stay cacheable."""

from apps.library.services.library import active_entitlements

from .notifications import unread_count
from .study_profile import get_profile, should_show_onboarding


def continue_entry(entitlements):
    """The readable entitlement touched most recently and not finished, or ``None``."""
    best = None
    for e in entitlements:
        p = getattr(e, "progress", None)
        if e.revoked_at is not None or p is None or not p.total_pages or p.page >= p.total_pages:
            continue
        if best is None or p.updated_at > best.progress.updated_at:
            best = e
    return best


def nav_summary(user) -> dict:
    entitlements = active_entitlements(user)
    profile = get_profile(user)
    return {
        "unread": unread_count(user),
        "has_library": bool(entitlements),
        "continue_entry": continue_entry(entitlements),
        "show_onboarding": should_show_onboarding(user),
        "exam_type": profile.exam_type.slug if profile and profile.exam_type_id else None,
    }
