"""Anti-scraping limits for the reader. Rates come from settings at request time."""

from django.conf import settings
from rest_framework.throttling import UserRateThrottle


class _SettingsRateThrottle(UserRateThrottle):
    setting = ""
    default = ""

    def get_rate(self):
        return getattr(settings, self.setting, self.default)


class ChapterMinuteThrottle(_SettingsRateThrottle):
    scope = "reader_chapter"
    setting = "READER_CHAPTER_RATE"
    default = "30/min"


class ChapterDayThrottle(_SettingsRateThrottle):
    scope = "reader_chapter_day"
    setting = "READER_CHAPTER_DAY_RATE"
    default = "800/day"


class SearchThrottle(_SettingsRateThrottle):
    scope = "reader_search"
    setting = "READER_SEARCH_RATE"
    default = "30/min"


class DeviceRemoveThrottle(_SettingsRateThrottle):
    scope = "reader_device_remove"
    setting = "READER_DEVICE_REMOVE_RATE"
    default = "5/day"


class CopyThrottle(_SettingsRateThrottle):
    scope = "reader_copy"
    setting = "READER_COPY_RATE"
    default = "60/min"


class ExportThrottle(_SettingsRateThrottle):
    scope = "reader_export"
    setting = "READER_EXPORT_RATE"
    default = "30/hour"


class OfflineThrottle(_SettingsRateThrottle):
    scope = "reader_offline"
    setting = "READER_OFFLINE_RATE"
    default = "10/day"


class CaptureEventThrottle(_SettingsRateThrottle):
    scope = "reader_capture"
    setting = "READER_CAPTURE_EVENT_RATE"
    default = "60/hour"
