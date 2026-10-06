from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from .phone import normalize_phone, validate_phone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, phone, password, **extra_fields):
        if not phone:
            raise ValueError("phone is required")
        phone = normalize_phone(phone)
        validate_phone(phone)
        user = self.model(phone=phone, **extra_fields)
        if password and (extra_fields.get("is_staff") or extra_fields.get("is_superuser")):
            user.set_password(password)
        else:
            # Customers sign in with OTP (Phase 3); passwords are for staff only.
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(phone, password, **extra_fields)

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(phone, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField(
        "شماره موبایل",
        max_length=11,
        unique=True,
        validators=[validate_phone],
        help_text="به شکل ۰۹xxxxxxxxx",
        error_messages={"unique": "کاربری با این شماره موبایل وجود دارد."},
    )
    first_name = models.CharField("نام", max_length=150, blank=True)
    last_name = models.CharField("نام خانوادگی", max_length=150, blank=True)
    is_staff = models.BooleanField("کارمند", default=False, help_text="اجازه ورود به پنل مدیریت.")
    is_active = models.BooleanField("فعال", default=True)
    date_joined = models.DateTimeField("تاریخ عضویت", default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.get_full_name() or self.phone

    def clean(self):
        super().clean()
        self.phone = normalize_phone(self.phone)

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name or self.phone


class OtpCode(models.Model):
    """A login code sent by SMS. Only a hash of the code is stored.

    Rate limits (per phone and per IP) live in the cache; this table is the source of truth for
    validity: a code is usable while ``consumed_at`` is null, ``expires_at`` is in the future and
    ``attempts`` is below ``OTP_MAX_ATTEMPTS``. Requesting a new code invalidates older ones.
    """

    phone = models.CharField("شماره موبایل", max_length=11, db_index=True)
    code_hash = models.CharField("هش کد", max_length=128)
    expires_at = models.DateTimeField("انقضا")
    attempts = models.PositiveSmallIntegerField("تلاش‌های ناموفق", default=0)
    consumed_at = models.DateTimeField("استفاده‌شده در", null=True, blank=True)
    ip = models.GenericIPAddressField("IP", null=True, blank=True)
    created_at = models.DateTimeField("ایجاد", auto_now_add=True)

    class Meta:
        verbose_name = "کد ورود"
        verbose_name_plural = "کدهای ورود"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["phone", "-created_at"], name="otp_phone_created")]

    def __str__(self) -> str:
        return f"{self.phone} — {self.created_at:%Y-%m-%d %H:%M}"
