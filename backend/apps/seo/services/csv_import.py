"""CSV import of redirects from the admin: ``old_path,new_path[,status]`` per line.

The owner exports the full list from Sazito / Google Search Console. A header row is optional.
Existing redirects (same key) are updated in place; unchanged rows are counted as skipped.
"""

import csv
import io
from dataclasses import dataclass, field

from django.core.exceptions import ValidationError
from django.db import transaction

from ..models import Redirect
from .keys import clean_path, redirect_key
from .redirects import MAX_PATH_LENGTH, validate_redirect

ALLOWED_STATUSES = {301, 302}


@dataclass
class ImportReport:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[tuple[int, str]] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.created + self.updated + self.skipped + len(self.errors)


def _is_header(row: list[str]) -> bool:
    first = row[0].strip().lower().lstrip("﻿")
    return not (first.startswith("/") or first.startswith(("http://", "https://")))


def _messages(exc: ValidationError) -> str:
    return " ".join(exc.messages)


def read_text(data: bytes | str) -> str:
    if isinstance(data, bytes):
        try:
            return data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return data.decode("cp1256", errors="replace")  # Excel on Persian Windows
    return data.lstrip("﻿")


def import_csv(data: bytes | str) -> ImportReport:
    report = ImportReport()
    seen: dict[str, int] = {}
    rows = csv.reader(io.StringIO(read_text(data)))
    for line, row in enumerate(rows, start=1):
        row = [cell.strip() for cell in row]
        if not any(row):
            continue
        if line == 1 and _is_header(row):
            continue
        if len(row) < 2 or not row[0] or not row[1]:
            report.errors.append((line, "هر سطر باید دست‌کم نشانی قدیمی و نشانی جدید داشته باشد."))
            continue
        old_path, new_path = clean_path(row[0]), row[1]
        if new_path.lower().startswith("http://"):
            new_path = "https://" + new_path[len("http://") :]
        status_text = row[2] if len(row) > 2 and row[2] else "301"
        try:
            status = int(status_text)
        except ValueError:
            status = 0
        if status not in ALLOWED_STATUSES:
            report.errors.append((line, f"کد وضعیت «{status_text}» نامعتبر است (۳۰۱ یا ۳۰۲)."))
            continue
        if len(old_path) > MAX_PATH_LENGTH or len(new_path) > MAX_PATH_LENGTH:
            report.errors.append((line, "نشانی بیش از ۵۰۰ نویسه است."))
            continue
        key = redirect_key(old_path)
        if key in seen:
            report.errors.append((line, f"تکراری؛ همین نشانی در سطر {seen[key]} آمده است."))
            continue
        seen[key] = line

        existing = Redirect.objects.filter(old_path_key=key).first()
        if existing and existing.new_path == new_path and existing.status_code == status:
            report.skipped += 1
            continue
        try:
            validate_redirect(old_path, new_path, exclude_pk=existing.pk if existing else None)
        except ValidationError as exc:
            report.errors.append((line, _messages(exc)))
            continue
        with transaction.atomic():
            if existing:
                existing.new_path = new_path
                existing.status_code = status
                existing.is_active = True
                existing.save()
                report.updated += 1
            else:
                Redirect.objects.create(
                    old_path=old_path,
                    new_path=new_path,
                    status_code=status,
                    source=Redirect.Source.IMPORT,
                )
                report.created += 1
    return report
