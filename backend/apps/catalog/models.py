from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.slugs import unique_slug

hex_color_validator = RegexValidator(
    r"^#[0-9A-Fa-f]{6}$", "رنگ را به شکل هگز وارد کنید، مثلاً #1F4E8C."
)


class SluggedModel(TimeStampedModel):
    """Base for models with a unique Unicode slug generated from ``slug_source`` when blank."""

    slug_source = "name"

    slug = models.SlugField(
        "نامک",
        max_length=200,
        unique=True,
        allow_unicode=True,
        blank=True,
        help_text="خالی بگذارید تا خودکار از عنوان ساخته شود.",
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(self, getattr(self, self.slug_source))
        super().save(*args, **kwargs)


class HubIntroMixin:
    """Sanitises the hub ``intro`` HTML on save (package ب, impl/hubs)."""

    def save(self, *args, **kwargs):
        from .services.text import sanitize_html

        self.intro = sanitize_html(self.intro)
        super().save(*args, **kwargs)


class ExamType(HubIntroMixin, SluggedModel):
    name = models.CharField("نام", max_length=100)
    short_name = models.CharField("نام کوتاه", max_length=50, blank=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    # --- hubs (package ب, impl/hubs): editorial intro for the /آزمون/{slug} hub page ---
    intro = models.TextField(
        "مقدمه صفحه",
        blank=True,
        help_text="متن اختصاصی صفحه این آزمون در سایت (حداقل حدود ۱۵۰ کلمه تا صفحه در گوگل "
        "ایندکس شود). HTML ساده مجاز است و پاک‌سازی می‌شود.",
    )
    intro_byline = models.CharField(
        "تهیه‌کننده مقدمه",
        max_length=200,
        blank=True,
        help_text="مثلاً «تیم آموزشی آکادمی دادرُز»؛ زیر مقدمه نمایش داده می‌شود.",
    )
    intro_is_placeholder = models.BooleanField(
        "مقدمه موقت است",
        default=False,
        help_text="متن نمونه‌ای که هنوز آکادمی جایگزین نکرده؛ صفحه تا برداشتن این تیک noindex "
        "می‌ماند.",
    )

    class Meta:
        verbose_name = "آزمون"
        verbose_name_plural = "آزمون‌ها"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name


class Subject(HubIntroMixin, SluggedModel):
    name = models.CharField("نام", max_length=100)
    color = models.CharField(
        "رنگ", max_length=7, default="#12264A", validators=[hex_color_validator]
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    description = models.TextField("توضیحات", blank=True)
    is_active = models.BooleanField("فعال", default=True)

    # --- hubs (package ب, impl/hubs): editorial intro for the /درس/{slug} hub page ---
    intro = models.TextField(
        "مقدمه صفحه",
        blank=True,
        help_text="متن اختصاصی صفحه این درس در سایت (حداقل حدود ۱۵۰ کلمه تا صفحه در گوگل "
        "ایندکس شود). HTML ساده مجاز است و پاک‌سازی می‌شود.",
    )
    intro_byline = models.CharField(
        "تهیه‌کننده مقدمه",
        max_length=200,
        blank=True,
        help_text="مثلاً «تیم آموزشی آکادمی دادرُز»؛ زیر مقدمه نمایش داده می‌شود.",
    )
    intro_is_placeholder = models.BooleanField(
        "مقدمه موقت است",
        default=False,
        help_text="متن نمونه‌ای که هنوز آکادمی جایگزین نکرده؛ صفحه تا برداشتن این تیک noindex "
        "می‌ماند.",
    )

    class Meta:
        verbose_name = "درس"
        verbose_name_plural = "درس‌ها"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name


class Category(SluggedModel):
    name = models.CharField("نام", max_length=150)
    parent = models.ForeignKey(
        "self",
        verbose_name="دسته والد",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.CASCADE,
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    description = models.TextField("توضیحات", blank=True)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دسته‌بندی"
        verbose_name_plural = "دسته‌بندی‌ها"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.parent.name} › {self.name}" if self.parent_id else self.name


class Person(SluggedModel):
    name = models.CharField("نام", max_length=150)
    bio = models.TextField("زندگی‌نامه", blank=True)
    photo = models.ImageField("عکس", upload_to="people/", blank=True)
    # --- hubs (package ب, impl/hubs): credentials for /author/{slug} (E-E-A-T, Person JSON-LD) ---
    job_title = models.CharField(
        "سمت",
        max_length=200,
        blank=True,
        help_text="مثلاً «عضو هیئت علمی دانشکده حقوق» یا «وکیل پایه یک».",
    )
    affiliation = models.CharField(
        "دانشگاه / سازمان", max_length=200, blank=True, help_text="مثلاً «دانشگاه تهران»."
    )
    same_as = models.TextField(
        "صفحه‌های رسمی",
        blank=True,
        help_text="هر نشانی در یک خط (وب‌سایت شخصی، صفحه دانشگاه، ویکی‌پدیا…). فقط https.",
    )

    class Meta:
        verbose_name = "شخص (نویسنده/مترجم)"
        verbose_name_plural = "نویسندگان و مترجمان"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Publisher(HubIntroMixin, SluggedModel):
    name = models.CharField("نام", max_length=150)
    website = models.URLField("وب‌سایت", blank=True)
    # --- hubs (package ب, impl/hubs) ---
    intro = models.TextField(
        "معرفی ناشر",
        blank=True,
        help_text="متن معرفی در صفحه ناشر. HTML ساده مجاز است و پاک‌سازی می‌شود.",
    )

    class Meta:
        verbose_name = "ناشر"
        verbose_name_plural = "ناشران"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CourseQuerySet(models.QuerySet):
    def exposed(self):
        """Courses that may appear on the site: active, open for sale and with a known price.

        Archived courses and old WooCommerce products are kept for reference only.
        """
        return self.filter(is_active=True, status__in=RelatedCourse.EXPOSED_STATUSES).filter(
            models.Q(is_free=True) | models.Q(price__isnull=False)
        )


class RelatedCourse(TimeStampedModel):
    """A course of the Dadrose academy (dadrose.com). Purchase links out to the academy site.

    The model keeps its historic name (``RelatedCourse``) and table; the API calls it ``Course``.
    """

    class CourseType(models.TextChoices):
        FULL = "FULL", "دوره جامع"
        ESSENTIALS = "ESSENTIALS", "امهات"
        TIPS_TESTS = "TIPS_TESTS", "نکته و تست"
        REVIEW = "REVIEW", "جمع‌بندی"
        WORKSHOP_ADVICE = "WORKSHOP_ADVICE", "مشاوره و کارگاه"
        MOCK = "MOCK", "آزمون آزمایشی"
        PACKAGE = "PACKAGE", "پکیج"
        OTHER = "OTHER", "سایر"

    class Status(models.TextChoices):
        OPEN = "OPEN", "قابل خرید"
        OPEN_UNLISTED = "OPEN_UNLISTED", "قابل خرید (خارج از فهرست)"
        ARCHIVED = "ARCHIVED", "بایگانی‌شده"
        LEGACY = "LEGACY", "محصول قدیمی"

    EXPOSED_STATUSES = (Status.OPEN, Status.OPEN_UNLISTED)

    title = models.CharField("عنوان", max_length=250)
    url = models.URLField("لینک دوره", max_length=500, unique=True)
    course_type = models.CharField(
        "نوع دوره", max_length=20, choices=CourseType.choices, default=CourseType.OTHER
    )
    subject = models.ForeignKey(
        Subject,
        verbose_name="درس",
        null=True,
        blank=True,
        related_name="courses",
        on_delete=models.SET_NULL,
    )
    exam_types = models.ManyToManyField(
        ExamType, verbose_name="آزمون‌ها", related_name="courses", blank=True
    )
    teachers = models.JSONField(
        "مدرسان", default=list, blank=True, help_text='فهرست نام‌ها، مثلاً ["امین بیات"].'
    )
    price = models.PositiveIntegerField(
        "قیمت (تومان)",
        null=True,
        blank=True,
        help_text="خالی یعنی قیمت نامعلوم (نمایش داده نمی‌شود).",
    )
    sale_price = models.PositiveIntegerField("قیمت با تخفیف (تومان)", null=True, blank=True)
    is_free = models.BooleanField("رایگان", default=False)
    hours = models.DecimalField("ساعت آموزش", max_digits=6, decimal_places=2, null=True, blank=True)
    sessions = models.PositiveSmallIntegerField("تعداد جلسات", null=True, blank=True)
    students_count = models.PositiveIntegerField("تعداد دانشجو", null=True, blank=True)
    rating = models.DecimalField(
        "امتیاز",
        max_digits=2,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
    )
    reviews_count = models.PositiveIntegerField("تعداد نظرها", default=0)
    image = models.ImageField("تصویر", upload_to="courses/", blank=True)
    image_source_url = models.URLField("نشانی منبع تصویر", max_length=500, blank=True)
    intro_video_url = models.URLField("ویدیوی معرفی / جلسه رایگان", max_length=500, blank=True)
    short_description = models.CharField("توضیح کوتاه", max_length=300, blank=True)
    selling_points = models.JSONField(
        "ویژگی‌ها", default=list, blank=True, help_text="فهرست جمله‌های کوتاه."
    )
    status = models.CharField(
        "وضعیت",
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        help_text="فقط دوره‌های «قابل خرید» روی سایت نمایش داده می‌شوند.",
    )
    is_module = models.BooleanField("بخشی از یک دوره بزرگ‌تر", default=False)
    source_url = models.URLField("منبع اطلاعات", max_length=500, blank=True)
    checked_on = models.DateField("تاریخ بررسی", null=True, blank=True)
    notes = models.TextField("یادداشت داخلی", blank=True)
    is_active = models.BooleanField("فعال", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    objects = CourseQuerySet.as_manager()

    class Meta:
        verbose_name = "دوره آکادمی"
        verbose_name_plural = "دوره‌های آکادمی"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.title

    @property
    def effective_price(self) -> int:
        from .services.pricing import effective_price

        if self.is_free:
            return 0
        return effective_price(self.price or 0, self.sale_price)

    @property
    def is_exposed(self) -> bool:
        return (
            self.is_active
            and self.status in self.EXPOSED_STATUSES
            and (self.is_free or self.price is not None)
        )


class BookCourse(models.Model):
    """A book ↔ course link with its relevance (shown in ``course_offer``)."""

    class Relevance(models.TextChoices):
        REFERENCED = "referenced", "تدریس‌شده بر اساس همین کتاب"
        SAME_AUTHOR = "same_author", "تدریس توسط مؤلف همین کتاب"
        SAME_SUBJECT = "same_subject", "دوره همین درس"
        GENERAL = "general", "مهارت آزمون"

    RANK = {
        Relevance.REFERENCED: 0,
        Relevance.SAME_AUTHOR: 1,
        Relevance.SAME_SUBJECT: 2,
        Relevance.GENERAL: 3,
    }

    book = models.ForeignKey(
        "Book", verbose_name="کتاب", related_name="course_links", on_delete=models.CASCADE
    )
    course = models.ForeignKey(
        RelatedCourse, verbose_name="دوره", related_name="book_links", on_delete=models.CASCADE
    )
    relevance = models.CharField(
        "نوع ارتباط", max_length=20, choices=Relevance.choices, default=Relevance.SAME_SUBJECT
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    reason = models.CharField("دلیل (داخلی)", max_length=500, blank=True)

    class Meta:
        verbose_name = "دوره مرتبط با کتاب"
        verbose_name_plural = "دوره‌های مرتبط با کتاب"
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["book", "course"], name="unique_book_course"),
        ]

    def __str__(self) -> str:
        return f"{self.book_id} ↔ {self.course}"


class SubjectCourseDiscount(TimeStampedModel):
    """A course discount code the academy created, shown on the books of one subject."""

    subject = models.ForeignKey(
        Subject, verbose_name="درس", related_name="course_discounts", on_delete=models.CASCADE
    )
    code = models.CharField("کد تخفیف", max_length=50)
    percent = models.PositiveSmallIntegerField(
        "درصد تخفیف",
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
    )
    label = models.CharField(
        "متن نمایشی",
        max_length=200,
        blank=True,
        help_text="خالی بگذارید تا خودکار ساخته شود، مثلاً «۱۵٪ تخفیف دوره‌های حقوق مدنی "
        "برای خریداران این کتاب».",
    )
    expires_on = models.DateField(
        "تاریخ انقضا",
        null=True,
        blank=True,
        help_text="خالی یعنی تا تاریخ آزمون بعدی نمایش داده می‌شود.",
    )
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "کد تخفیف دوره"
        verbose_name_plural = "کدهای تخفیف دوره"
        ordering = ["-id"]

    def __str__(self) -> str:
        return f"{self.code} — {self.subject}"


class Book(SluggedModel):
    class ResourceType(models.TextChoices):
        TEXTBOOK = "TEXTBOOK", "درسنامه"
        TESTS = "TESTS", "تست و مجموعه سؤالات"
        LAWS = "LAWS", "مجموعه قوانین"
        QUICK_REVIEW = "QUICK_REVIEW", "سریع‌خوان"
        COURSE_NOTES = "COURSE_NOTES", "جزوه دوره"

    slug_source = "title"

    title = models.CharField("عنوان", max_length=250)
    subtitle = models.CharField("زیرعنوان", max_length=250, blank=True)
    authors = models.ManyToManyField(
        Person, verbose_name="نویسندگان", related_name="authored_books", blank=True
    )
    translators = models.ManyToManyField(
        Person, verbose_name="مترجمان", related_name="translated_books", blank=True
    )
    publisher = models.ForeignKey(
        Publisher,
        verbose_name="ناشر",
        null=True,
        blank=True,
        related_name="books",
        on_delete=models.SET_NULL,
    )
    subjects = models.ManyToManyField(
        Subject, verbose_name="درس‌ها", related_name="books", blank=True
    )
    exam_types = models.ManyToManyField(
        ExamType, verbose_name="آزمون‌ها", related_name="books", blank=True
    )
    categories = models.ManyToManyField(
        Category, verbose_name="دسته‌بندی‌ها", related_name="books", blank=True
    )
    edition = models.CharField("ویرایش", max_length=100, blank=True)
    publish_year = models.PositiveSmallIntegerField(
        "سال انتشار (شمسی)",
        null=True,
        blank=True,
        validators=[MinValueValidator(1300), MaxValueValidator(1500)],
    )
    law_updated_until = models.CharField(
        "به‌روز تا (اصلاحات قانون)",
        max_length=200,
        blank=True,
        help_text="مثلاً «اصلاحات قانون حمایت خانواده ۱۴۰۴». زیر نشان ویرایش نمایش داده می‌شود.",
    )
    resource_type = models.CharField(
        "نوع منبع",
        max_length=20,
        choices=ResourceType.choices,
        default=ResourceType.TEXTBOOK,
        help_text="«سریع‌خوان» با گزینه سریع‌خوان همگام می‌شود.",
    )
    volumes = models.PositiveSmallIntegerField("تعداد جلد", default=1)
    pages = models.PositiveIntegerField("تعداد صفحات", null=True, blank=True)
    isbn = models.CharField("شابک", max_length=20, blank=True)
    description = models.TextField("معرفی", blank=True)
    table_of_contents = models.TextField("فهرست مطالب", blank=True, help_text="هر سرفصل در یک خط.")
    study_plan_note = models.TextField("جایگاه در برنامه مطالعه", blank=True)
    study_days = models.PositiveSmallIntegerField(
        "زمان مطالعه پیشنهادی (روز)",
        null=True,
        blank=True,
        help_text="حدود چند روز مطالعه لازم است؛ خالی یعنی نامشخص.",
    )
    cover = models.ImageField("جلد", upload_to="covers/", blank=True)
    cover_source_url = models.URLField(
        "نشانی منبع جلد",
        max_length=1000,
        blank=True,
        help_text="تصویر جلد با دستور fetch_covers از این نشانی دریافت می‌شود (اگر جلد خالی باشد).",
    )
    sample_pdf = models.FileField("نمونه PDF", upload_to="samples/", blank=True)
    intro_video_url = models.URLField("ویدیوی معرفی", blank=True)
    related_courses = models.ManyToManyField(
        RelatedCourse,
        verbose_name="دوره‌های مرتبط",
        related_name="books",
        blank=True,
        through=BookCourse,
    )
    is_featured = models.BooleanField("ویژه", default=False)
    is_quick_review = models.BooleanField("سریع‌خوان", default=False)
    # --- free statute ebooks (ه۶, apps.library «دریافت رایگان») ---
    is_free_ebook = models.BooleanField(
        "کتاب الکترونیک رایگان",
        default=False,
        help_text="مثلاً متن قوانین. کاربر با «دریافت رایگان» (پس از ورود) آن را به کتابخانه‌اش "
        "اضافه می‌کند. فایل EPUB/PDF را در «فایل‌های کتاب الکترونیک» بارگذاری کنید.",
    )
    sales_count = models.PositiveIntegerField("تعداد فروش", default=0)
    season_sales_count = models.PositiveIntegerField(
        "خریداران این فصل",
        default=0,
        help_text="فعلاً دستی؛ از فاز ۳ از روی سفارش‌ها خودکار پر می‌شود. "
        "فقط وقتی ۲۰ یا بیشتر باشد روی سایت نمایش داده می‌شود.",
    )
    is_active = models.BooleanField("فعال", default=True)
    legacy_path = models.CharField(
        "نشانی در سایت قبلی",
        max_length=500,
        blank=True,
        db_index=True,
        help_text="مسیر این کتاب در فروشگاه قبلی (مثلاً /product/…)؛ برای ریدایرکت ۳۰۱.",
    )
    search_text = models.TextField("متن جستجو", blank=True, editable=False)

    class Meta:
        verbose_name = "کتاب"
        verbose_name_plural = "کتاب‌ها"
        ordering = ["-sales_count", "id"]

    def __str__(self) -> str:
        return self.title

    @classmethod
    def from_db(cls, db, field_names, values):
        instance = super().from_db(db, field_names, values)
        instance._loaded_resource_type = instance.__dict__.get("resource_type")
        return instance

    def save(self, *args, **kwargs):
        from .services.resource_types import sync_quick_review
        from .services.search import refresh_search_text
        from .services.text import sanitize_html

        self.description = sanitize_html(self.description)
        sync_quick_review(self, getattr(self, "_loaded_resource_type", None))
        self._loaded_resource_type = self.resource_type
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and (
            "resource_type" in update_fields or "is_quick_review" in update_fields
        ):
            kwargs["update_fields"] = {*update_fields, "resource_type", "is_quick_review"}
        super().save(*args, **kwargs)
        refresh_search_text(self)


class BookSamplePage(TimeStampedModel):
    book = models.ForeignKey(
        Book, verbose_name="کتاب", related_name="sample_pages", on_delete=models.CASCADE
    )
    image = models.ImageField("تصویر صفحه", upload_to="samples/pages/")
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "صفحه نمونه"
        verbose_name_plural = "صفحات نمونه (ورق بزنید)"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.book} — {self.order}"


class BookVariant(TimeStampedModel):
    class Type(models.TextChoices):
        PRINT = "PRINT", "نسخه چاپی"
        EBOOK = "EBOOK", "نسخه الکترونیک"
        BUNDLE = "BUNDLE", "چاپی + الکترونیک"

    TYPE_ORDER = {Type.PRINT: 0, Type.EBOOK: 1, Type.BUNDLE: 2}

    book = models.ForeignKey(
        Book, verbose_name="کتاب", related_name="variants", on_delete=models.CASCADE
    )
    type = models.CharField("نوع نسخه", max_length=10, choices=Type.choices)
    price = models.PositiveIntegerField("قیمت (تومان)")
    sale_price = models.PositiveIntegerField("قیمت با تخفیف (تومان)", null=True, blank=True)
    stock = models.PositiveIntegerField(
        "موجودی", default=0, help_text="برای نسخه الکترونیک استفاده نمی‌شود."
    )
    is_active = models.BooleanField("فعال", default=True)
    price_is_placeholder = models.BooleanField(
        "قیمت موقت است", default=False, help_text="قیمت هنوز توسط فروشگاه تأیید نشده است."
    )
    price_note = models.CharField(
        "منبع قیمت", max_length=250, blank=True, help_text="منبع/توضیح قیمت"
    )

    class Meta:
        verbose_name = "نسخه کتاب"
        verbose_name_plural = "نسخه‌ها و قیمت‌ها"
        ordering = ["book_id", "type"]
        constraints = [
            models.UniqueConstraint(fields=["book", "type"], name="unique_book_variant_type"),
        ]

    def __str__(self) -> str:
        return f"{self.book} — {self.get_type_display()}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.sale_price is not None and self.price and self.sale_price >= self.price:
            raise ValidationError({"sale_price": "قیمت با تخفیف باید کمتر از قیمت اصلی باشد."})

    @property
    def effective_price(self) -> int:
        from .services.pricing import effective_price

        return effective_price(self.price, self.sale_price)

    @property
    def discount_percent(self) -> int:
        from .services.pricing import discount_percent

        return discount_percent(self.price, self.sale_price)

    @property
    def in_stock(self) -> bool:
        return self.type == self.Type.EBOOK or self.stock > 0


class ExamEvent(TimeStampedModel):
    name = models.CharField("عنوان", max_length=200)
    exam_type = models.ForeignKey(
        ExamType, verbose_name="آزمون", related_name="events", on_delete=models.CASCADE
    )
    date = models.DateField("تاریخ برگزاری")
    is_active = models.BooleanField("فعال", default=True)
    # --- ux stream (ج۵ add-to-calendar): optional registration window ---
    registration_start = models.DateField("شروع ثبت‌نام", null=True, blank=True)
    registration_end = models.DateField("پایان ثبت‌نام", null=True, blank=True)

    class Meta:
        verbose_name = "تاریخ آزمون"
        verbose_name_plural = "تاریخ آزمون‌ها"
        ordering = ["date", "id"]

    def __str__(self) -> str:
        return self.name


class StudyKitRecommendation(TimeStampedModel):
    exam_type = models.ForeignKey(
        ExamType, verbose_name="آزمون", related_name="kit_recommendations", on_delete=models.CASCADE
    )
    subject = models.ForeignKey(
        Subject, verbose_name="درس", related_name="kit_recommendations", on_delete=models.CASCADE
    )
    note = models.TextField("یادداشت", blank=True)
    weight = models.PositiveSmallIntegerField(
        "ضریب درس",
        null=True,
        blank=True,
        help_text="ضریب این درس در این آزمون؛ کاشی‌های درس به ترتیب ضریب مرتب می‌شوند. "
        "ضرایب اولیه باید با دفترچه رسمی آزمون تطبیق داده شوند.",
    )
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "بسته مطالعاتی پیشنهادی"
        verbose_name_plural = "بسته‌های مطالعاتی پیشنهادی"
        ordering = ["exam_type__order", "subject__order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["exam_type", "subject"], name="unique_kit_exam_type_subject"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.exam_type} — {self.subject}"


class StudyKitItem(TimeStampedModel):
    recommendation = models.ForeignKey(
        StudyKitRecommendation,
        verbose_name="بسته مطالعاتی",
        related_name="items",
        on_delete=models.CASCADE,
    )
    book = models.ForeignKey(
        Book, verbose_name="کتاب", related_name="kit_items", on_delete=models.CASCADE
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_essential = models.BooleanField("ضروری", default=True)

    class Meta:
        verbose_name = "کتاب بسته مطالعاتی"
        verbose_name_plural = "کتاب‌های بسته مطالعاتی"
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["recommendation", "book"], name="unique_kit_item_book"),
        ]

    def __str__(self) -> str:
        return f"{self.recommendation} — {self.book}"
