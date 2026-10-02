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


class ExamType(SluggedModel):
    name = models.CharField("نام", max_length=100)
    short_name = models.CharField("نام کوتاه", max_length=50, blank=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "آزمون"
        verbose_name_plural = "آزمون‌ها"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.name


class Subject(SluggedModel):
    name = models.CharField("نام", max_length=100)
    color = models.CharField(
        "رنگ", max_length=7, default="#12264A", validators=[hex_color_validator]
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    description = models.TextField("توضیحات", blank=True)
    is_active = models.BooleanField("فعال", default=True)

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

    class Meta:
        verbose_name = "شخص (نویسنده/مترجم)"
        verbose_name_plural = "نویسندگان و مترجمان"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Publisher(SluggedModel):
    name = models.CharField("نام", max_length=150)
    website = models.URLField("وب‌سایت", blank=True)

    class Meta:
        verbose_name = "ناشر"
        verbose_name_plural = "ناشران"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class RelatedCourse(TimeStampedModel):
    title = models.CharField("عنوان", max_length=200)
    url = models.URLField("لینک دوره")
    price = models.PositiveIntegerField("قیمت (تومان)", default=0)
    image = models.ImageField("تصویر", upload_to="courses/", blank=True)
    is_active = models.BooleanField("فعال", default=True)
    order = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "دوره مرتبط"
        verbose_name_plural = "دوره‌های مرتبط"
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.title


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
    sample_pdf = models.FileField("نمونه PDF", upload_to="samples/", blank=True)
    intro_video_url = models.URLField("ویدیوی معرفی", blank=True)
    related_courses = models.ManyToManyField(
        RelatedCourse, verbose_name="دوره‌های مرتبط", related_name="books", blank=True
    )
    is_featured = models.BooleanField("ویژه", default=False)
    is_quick_review = models.BooleanField("سریع‌خوان", default=False)
    sales_count = models.PositiveIntegerField("تعداد فروش", default=0)
    season_sales_count = models.PositiveIntegerField(
        "خریداران این فصل",
        default=0,
        help_text="فعلاً دستی؛ از فاز ۳ از روی سفارش‌ها خودکار پر می‌شود. "
        "فقط وقتی ۲۰ یا بیشتر باشد روی سایت نمایش داده می‌شود.",
    )
    is_active = models.BooleanField("فعال", default=True)
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

    class Meta:
        verbose_name = "نسخه کتاب"
        verbose_name_plural = "نسخه‌ها و قیمت‌ها"
        ordering = ["book_id", "type"]
        constraints = [
            models.UniqueConstraint(fields=["book", "type"], name="unique_book_variant_type"),
        ]

    def __str__(self) -> str:
        return f"{self.book} — {self.get_type_display()}"

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
