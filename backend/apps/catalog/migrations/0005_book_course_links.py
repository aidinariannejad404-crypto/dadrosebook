"""Move ``Book.related_courses`` onto the ``BookCourse`` through model (keeps existing links)."""

from django.db import migrations, models


def copy_links(apps, schema_editor):
    Book = apps.get_model("catalog", "Book")
    BookCourse = apps.get_model("catalog", "BookCourse")
    through = Book.related_courses.through
    BookCourse.objects.bulk_create(
        [
            BookCourse(book_id=row.book_id, course_id=row.relatedcourse_id, relevance="same_subject")
            for row in through.objects.all()
        ],
        ignore_conflicts=True,
    )


def copy_links_back(apps, schema_editor):
    """Reverse: links go back to the plain M2M table (relevance is lost)."""
    Book = apps.get_model("catalog", "Book")
    BookCourse = apps.get_model("catalog", "BookCourse")
    through = Book.related_courses.through
    through.objects.bulk_create(
        [
            through(book_id=link.book_id, relatedcourse_id=link.course_id)
            for link in BookCourse.objects.all()
        ],
        ignore_conflicts=True,
    )
    BookCourse.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_academy_courses"),
    ]

    operations = [
        migrations.RunPython(copy_links, copy_links_back),
        migrations.RemoveField(model_name="book", name="related_courses"),
        migrations.AddField(
            model_name="book",
            name="related_courses",
            field=models.ManyToManyField(
                blank=True,
                related_name="books",
                through="catalog.BookCourse",
                to="catalog.relatedcourse",
                verbose_name="دوره‌های مرتبط",
            ),
        ),
    ]
