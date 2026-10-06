from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Redirect
from .services.redirects import invalidate_redirect_map, mark_not_found_resolved


@receiver(post_save, sender=Redirect)
def redirect_saved(sender, instance: Redirect, **kwargs):
    invalidate_redirect_map()
    if instance.is_active:
        mark_not_found_resolved(instance.old_path)


@receiver(post_delete, sender=Redirect)
def redirect_deleted(sender, instance: Redirect, **kwargs):
    invalidate_redirect_map()
