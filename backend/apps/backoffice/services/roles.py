"""Ready-made staff roles (Django groups): each team member gets only what they need.

The groups are created and their permissions refreshed after every ``migrate``. Staff are put in a
group from «کاربران» → user → «گروه‌ها» (and must have «کارمند» ticked to log in to the panel).
Permissions an admin adds to a group by hand are kept; only the listed ones are (re)added.
"""

from django.contrib.auth.models import Group, Permission

ALL = ("view", "add", "change", "delete")
EDIT = ("view", "add", "change")
VIEW = ("view",)

# role name → {"app_label.model": actions}
ROLES: dict[str, dict[str, tuple[str, ...]]] = {
    "مدیر فروشگاه": {
        "catalog.book": ALL,
        "catalog.bookvariant": ALL,
        "catalog.booksamplepage": ALL,
        "catalog.bookcourse": ALL,
        "catalog.subject": ALL,
        "catalog.examtype": ALL,
        "catalog.examevent": ALL,
        "catalog.category": ALL,
        "catalog.person": ALL,
        "catalog.publisher": ALL,
        "catalog.studykitrecommendation": ALL,
        "catalog.studykititem": ALL,
        "catalog.relatedcourse": ALL,
        "catalog.subjectcoursediscount": ALL,
        "orders.order": ("view", "change"),
        "orders.orderitem": VIEW,
        "orders.orderstatuslog": VIEW,
        "orders.returnrequest": EDIT,
        "orders.returnline": ALL,
        "orders.returnrequestlog": VIEW,
        "orders.discountcode": ALL,
        "orders.discountredemption": VIEW,
        "orders.shippingmethod": ALL,
        "orders.address": EDIT,
        "payments.payment": VIEW,
        "payments.paymentlog": VIEW,
        "library.ebookentitlement": EDIT,
        "reviews.review": ("view", "change", "delete"),
        "engagement.backinstockrequest": ("view", "change"),
        "leads.lead": VIEW,
        "content.banner": ALL,
        "content.guidevideo": ALL,
        "core.storesettings": ("view", "change"),
        "core.smstemplate": ("view", "change"),
        "accounts.user": ("view", "change"),
        "cart.cart": VIEW,
        "wishlist.wishlistitem": VIEW,
        "backoffice.salesreport": VIEW,
        "admin.logentry": VIEW,
    },
    "انبار و ارسال": {
        "orders.order": ("view", "change"),
        "orders.returnrequest": ("view", "change"),
        "orders.returnline": VIEW,
        "orders.returnrequestlog": VIEW,
        "orders.orderitem": VIEW,
        "orders.orderstatuslog": VIEW,
        "orders.shippingmethod": VIEW,
        "orders.address": VIEW,
        "catalog.book": VIEW,
        "catalog.bookvariant": ("view", "change"),
        "engagement.backinstockrequest": ("view", "change"),
    },
    "پشتیبانی مشتریان": {
        "orders.order": ("view", "change"),
        "orders.returnrequest": EDIT,
        "orders.returnline": ALL,
        "orders.returnrequestlog": VIEW,
        "orders.orderitem": VIEW,
        "orders.orderstatuslog": VIEW,
        "orders.address": EDIT,
        "orders.discountcode": VIEW,
        "orders.discountredemption": VIEW,
        "payments.payment": VIEW,
        "payments.paymentlog": VIEW,
        "library.ebookentitlement": EDIT,
        "accounts.user": ("view", "change"),
        "reviews.review": ("view", "change"),
        "engagement.backinstockrequest": VIEW,
        "cart.cart": VIEW,
        "catalog.book": VIEW,
        "catalog.bookvariant": VIEW,
    },
    "محتوا و کاتالوگ": {
        "catalog.book": EDIT,
        "catalog.bookvariant": VIEW,
        "catalog.booksamplepage": ALL,
        "catalog.bookcourse": ALL,
        "catalog.subject": EDIT,
        "catalog.examtype": EDIT,
        "catalog.examevent": ALL,
        "catalog.category": EDIT,
        "catalog.person": EDIT,
        "catalog.publisher": EDIT,
        "catalog.studykitrecommendation": ALL,
        "catalog.studykititem": ALL,
        "catalog.relatedcourse": EDIT,
        "content.banner": ALL,
        "content.guidevideo": ALL,
        "reviews.review": ("view", "change"),
    },
    "گزارش‌گیر (فقط مشاهده)": {
        "backoffice.salesreport": VIEW,
        "orders.order": VIEW,
        "orders.orderitem": VIEW,
        "orders.discountcode": VIEW,
        "orders.discountredemption": VIEW,
        "catalog.book": VIEW,
        "catalog.bookvariant": VIEW,
        "engagement.backinstockrequest": VIEW,
    },
}


def role_permissions(spec: dict[str, tuple[str, ...]]) -> list[Permission]:
    perms = []
    for model_key, actions in spec.items():
        app_label, model = model_key.split(".")
        codenames = [f"{action}_{model}" for action in actions]
        perms += Permission.objects.filter(
            content_type__app_label=app_label, codename__in=codenames
        )
    return perms


def sync_staff_roles(**kwargs) -> list[Group]:
    """Create the groups and add their permissions (idempotent; a post_migrate receiver)."""
    groups = []
    for name, spec in ROLES.items():
        group, _ = Group.objects.get_or_create(name=name)
        group.permissions.add(*role_permissions(spec))
        groups.append(group)
    return groups
