from celery import shared_task


@shared_task(name="apps.study.tasks.review_prompts")
def review_prompts() -> dict:
    """Daily: create eligible review prompts, then text the open ones (each at most once)."""
    from .services import review_prompts as svc

    return {"created": svc.scan(), "sms": svc.send_sms()}


@shared_task(name="apps.study.tasks.notify_edition_owners")
def notify_edition_owners(link_id: int) -> int:
    """SMS owners of the old edition about the upgrade (idempotent per owner and link)."""
    from .models import EditionLink
    from .services.editions import notify_owners

    link = EditionLink.objects.filter(pk=link_id).first()
    return notify_owners(link) if link else 0
