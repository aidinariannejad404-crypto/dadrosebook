# راهنمای استقرار (Production) فروشگاه کتاب دادرُز

این سند برای راه‌اندازی سایت روی یک سرور لینوکسی (Ubuntu) نوشته شده است. همه‌چیز با Docker اجرا
می‌شود و هیچ سرویس پولیِ اضافه‌ای لازم نیست؛ فقط یک سرور، یک دامنه و (اختیاری) فضای ذخیره‌سازی ابری.

فایل‌های مربوط:

| فایل | کاربرد |
|---|---|
| `docker-compose.prod.yml` | تعریف سرویس‌ها: پایگاه‌داده، Redis، بک‌اند (gunicorn)، worker (Celery)، فرانت‌اند (Next.js)، Umami، Caddy |
| `.env.prod.example` | نمونهٔ همهٔ تنظیمات؛ از روی آن `.env.prod` ساخته می‌شود (هرگز در گیت قرار نگیرد) |
| `deploy/Caddyfile` | وب‌سرور جلویی: گواهی HTTPS خودکار، مسیریابی، هدرهای امنیتی، فشرده‌سازی |
| `deploy/postgres/init-umami.sh` | ساخت پایگاه‌دادهٔ جداگانهٔ `umami` روی همان Postgres |
| `deploy/backup.sh` | پشتیبان‌گیری شبانه از پایگاه‌داده‌ها و فایل‌ها |
| `deploy/smoke.sh` | آزمون سریع پس از هر استقرار |
| `.github/workflows/ci.yml` | اجرای خودکار تست‌ها و lint در GitHub (بدون استقرار خودکار) |

---

## ⚠️ تصمیم‌هایی که هنوز با مالک است

| موضوع | وضعیت | اثر |
|---|---|---|
| **سرویس‌دهندهٔ سرور** | فرض: سرور ابری ArvanCloud؛ هر VPS اوبونتو کار می‌کند | باید یک سرور خریداری شود |
| **دسترسی به DNS دامنه** | لازم است (رکوردهای apex، www و stats) | بدون آن انتقال از سازیتو ممکن نیست |
| **فضای ذخیره‌سازی ابری (Arvan Object Storage)** | اختیاری؛ بدون آن فایل‌ها روی دیسک سرور می‌مانند (`USE_S3=false`) | برای کتاب الکترونیکی و پشتیبان توصیه می‌شود |
| **CDN ابرآروان جلوی سایت** | اختیاری (پایین‌تر توضیح داده شده) | سرعت و محافظت در برابر حمله |
| **پنل پیامک** (مثلاً کاوه‌نگار) | تعیین نشده؛ فعلاً `SMS_PROVIDER=console` (پیامک فقط در لاگ ثبت می‌شود) | ورود با کد یکبارمصرف (فاز ۳) |
| **درگاه پرداخت زرین‌پال** | مرچنت‌کد لازم است (فاز ۳) | پرداخت آنلاین |
| **ایمیل خطاها** (اختیاری) | `ADMINS` و `EMAIL_URL` خالی‌اند | ارسال ایمیل هنگام خطای ۵۰۰ |

---

## ۱. پیش‌نیازهای سرور

- Ubuntu 22.04 یا 24.04، حداقل **۲ هسته پردازنده، ۴ گیگابایت رم، ۴۰ گیگابایت دیسک SSD**
  (با ۲ گیگابایت رم هم اجرا می‌شود ولی ساختن فرانت‌اند کند است؛ در آن صورت swap اضافه کنید).
- پورت‌های ۸۰ و ۴۴۳ (TCP) و ۴۴۳ (UDP برای HTTP/3) باز باشند. پورت ۲۲ فقط برای SSH.
- Docker Engine و افزونهٔ Docker Compose:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # سپس یک بار خروج و ورود دوباره
docker compose version
```

اگر دسترسی به Docker Hub از داخل ایران محدود بود، از mirror استفاده کنید (مثلاً mirror ابرآروان
`docker.arvancloud.ir`) و آن را در `/etc/docker/daemon.json` در بخش `registry-mirrors` قرار دهید.

دیوار آتش ساده:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

> نکته: Docker پورت‌های منتشرشده را مستقل از ufw باز می‌کند؛ به همین دلیل در `docker-compose.prod.yml`
> فقط Caddy پورت منتشر می‌کند و Postgres و Redis هیچ پورتی به بیرون ندارند.

## ۲. DNS

در پنل DNS دامنه (فرض: `dadrosebook.com`) این رکوردها را بسازید (IP سرور را جایگزین کنید):

| نوع | نام | مقدار |
|---|---|---|
| A | `@` (apex) | IP سرور |
| A | `www` | IP سرور |
| A | `stats` | IP سرور (داشبورد آمار Umami) |
| AAAA | (در صورت داشتن IPv6، همان سه نام) | IPv6 سرور |

Caddy برای هر سه نام به‌طور خودکار گواهی Let's Encrypt می‌گیرد؛ برای این کار رکوردها باید به سرور
اشاره کنند و پورت ۸۰ باز باشد. **هنگام انتقال از سازیتو** این مرحله را طبق بخش ۱۱ انجام دهید.

## ۳. اولین استقرار

```bash
sudo mkdir -p /opt/dadrosebook && sudo chown $USER /opt/dadrosebook
git clone <آدرس مخزن> /opt/dadrosebook
cd /opt/dadrosebook
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

در `.env.prod` همهٔ مقادیر `CHANGE_ME` را عوض کنید. ساخت رمزهای تصادفی:

```bash
openssl rand -hex 32                                              # POSTGRES_PASSWORD, UMAMI_DB_PASSWORD, REDIS_PASSWORD, UMAMI_APP_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(64))"     # SECRET_KEY
```

- رمزها را فقط از حروف و اعداد (خروجی `-hex`) بسازید، چون داخل آدرس اتصال قرار می‌گیرند.
- بک‌اند با `SECRET_KEY` پیش‌فرض یا کوتاه‌تر از ۵۰ نویسه **اجرا نمی‌شود** (عمدی است).
- دامنه‌ها را در `SITE_DOMAIN`، `STATS_DOMAIN`، `ALLOWED_HOSTS`، `CSRF_TRUSTED_ORIGINS`،
  `CORS_ALLOWED_ORIGINS`، `NEXT_PUBLIC_*` و `SITE_HOST` درست وارد کنید.
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` و `UMAMI_WEBSITE_ID` فعلاً خالی بمانند (بخش ۶).

ساخت و اجرا:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend caddy
```

برای کوتاه‌شدن دستورها می‌توانید یک alias بسازید (در ادامهٔ سند از آن استفاده شده):

```bash
echo "alias dc='docker compose -f /opt/dadrosebook/docker-compose.prod.yml --env-file /opt/dadrosebook/.env.prod'" >> ~/.bashrc
source ~/.bashrc
```

بک‌اند هنگام شروع خودش منتظر پایگاه‌داده می‌ماند، `migrate` و `collectstatic` را اجرا می‌کند و سپس
gunicorn را بالا می‌آورد. ساخت اول فرانت‌اند چند دقیقه طول می‌کشد.

## ۴. ساخت کاربر مدیر

```bash
dc exec backend python manage.py createsuperuser
```

نام کاربری شمارهٔ موبایل است (مثلاً `09121234567`). رمز قوی انتخاب کنید. پنل مدیریت:
`https://dadrosebook.com/admin/`.

## ۵. بارگذاری کاتالوگ اولیه

```bash
dc exec backend python manage.py seed_catalog --if-empty
dc exec backend python manage.py fetch_covers        # دریافت جلدهای جاافتاده (اختیاری)
```

`seed_catalog` آزمون‌ها، درس‌ها، دسته‌ها، کتاب‌ها و ریدایرکت‌های پیش‌فرض سازیتو را می‌سازد و با
`--if-empty` اگر کتابی وجود داشته باشد کاری نمی‌کند (ویرایش‌های پنل حفظ می‌شود).
گزینهٔ `--with-superuser` در production عمداً کار نمی‌کند؛ از بخش ۴ استفاده کنید.

پس از آن آزمون سریع:

```bash
deploy/smoke.sh https://dadrosebook.com
```

## ۶. آمار بازدید (Umami)

1. به `https://stats.dadrosebook.com` بروید. ورود اول: نام کاربری `admin` و رمز `umami`.
   **بلافاصله رمز را عوض کنید** (Settings → Profile).
2. Settings → Websites → Add website: نام «دادرُز»، دامنه `dadrosebook.com`.
3. شناسهٔ سایت (Website ID، یک UUID) را کپی کنید و در `.env.prod` در **هر دو** متغیر بگذارید:

```env
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<uuid>
UMAMI_WEBSITE_ID=<uuid>
```

4. **فرانت‌اند را دوباره بسازید** — متغیرهای `NEXT_PUBLIC_*` هنگام ساخت (build) داخل کد قرار
   می‌گیرند و با یک restart ساده عوض نمی‌شوند:

```bash
dc up -d --build frontend
dc up -d backend worker      # برای UMAMI_WEBSITE_ID (رویداد خرید سمت سرور)
```

5. در سایت چند صفحه را باز کنید و در داشبورد Umami بازدید را ببینید.

> اگر پایگاه‌دادهٔ Postgres قبلاً (بدون اسکریپت Umami) ساخته شده بود، اسکریپت init اجرا نشده است.
> یک بار دستی اجرا کنید:
>
> ```bash
> dc exec db sh /docker-entrypoint-initdb.d/10-init-umami.sh
> dc restart umami
> ```

پس از اولین استقرار موفق، نسخهٔ Umami را ثابت کنید (`UMAMI_IMAGE=ghcr.io/umami-software/umami:<نسخه>`)
تا به‌روزرسانی ناخواسته رخ ندهد.

## ۷. فضای ذخیره‌سازی ابری ابرآروان (اختیاری ولی توصیه‌شده)

بدون آن (`USE_S3=false`) جلد کتاب‌ها روی volume سرور ذخیره و توسط Caddy در مسیر `/media/` ارائه
می‌شوند و فایل کتاب‌های الکترونیکی در volume جداگانهٔ `private_media` می‌مانند که **هیچ مسیری برای
دسترسی مستقیم ندارد**.

با فضای ابری، دو باکت بسازید:

| باکت | دسترسی | محتوا |
|---|---|---|
| `dadrose-public` | **عمومی (Public read)** | جلد کتاب‌ها، نمونه صفحات، بنرها |
| `dadrose-private` | **خصوصی — هرگز عمومی نشود** | فایل کتاب‌های الکترونیکی (فقط با لینک امضاشده و کوتاه‌مدت) |

سپس در `.env.prod`:

```env
USE_S3=true
S3_ENDPOINT_URL=https://s3.ir-thr-at1.arvanstorage.ir
S3_REGION=ir-thr-at1
S3_PUBLIC_BUCKET=dadrose-public
S3_PRIVATE_BUCKET=dadrose-private
AWS_ACCESS_KEY_ID=<کلید دسترسی>
AWS_SECRET_ACCESS_KEY=<کلید محرمانه>
NEXT_PUBLIC_MEDIA_HOST=dadrose-public.s3.ir-thr-at1.arvanstorage.ir
```

(endpoint و region را از پنل ابرآروان بردارید؛ مقدار بالا نمونه است.) بعد:

```bash
dc up -d --build backend worker frontend
```

فایل‌هایی که پیش‌تر روی دیسک آپلود شده‌اند خودکار منتقل نمی‌شوند؛ اگر لازم شد با `rclone` یا
`aws s3 sync` از volume به باکت منتقل کنید. هرگز سیاست دسترسی عمومی روی باکت خصوصی نگذارید.

## ۸. به‌روزرسانی سایت

```bash
cd /opt/dadrosebook
deploy/backup.sh                 # اول پشتیبان
git pull
dc up -d --build
dc ps                            # همه healthy باشند
deploy/smoke.sh https://dadrosebook.com
```

مهاجرت‌های پایگاه‌داده هنگام بالا آمدن بک‌اند خودکار اجرا می‌شوند. پاک‌کردن ایمیج‌های قدیمی:
`docker image prune -f`.

## ۹. پشتیبان‌گیری و بازیابی

### پشتیبان‌گیری

```bash
deploy/backup.sh
```

این اسکریپت از پایگاه‌دادهٔ فروشگاه و پایگاه‌دادهٔ Umami خروجی فشرده می‌گیرد، در حالت
`USE_S3=false` از پوشه‌های media و private_media هم آرشیو می‌سازد، نسخه‌های قدیمی‌تر از
`BACKUP_KEEP_DAYS` روز را پاک می‌کند و اگر `BACKUP_S3_BUCKET` (با aws cli) یا `BACKUP_RCLONE_REMOTE`
(با rclone) تنظیم شده باشد، یک نسخه هم بیرون از سرور می‌فرستد. **پشتیبانی که فقط روی همان سرور باشد
کافی نیست.**

اجرای خودکار هر شب ساعت ۳:۳۰:

```bash
crontab -e
# این خط را اضافه کنید:
30 3 * * * cd /opt/dadrosebook && deploy/backup.sh >> /var/log/dadrosebook-backup.log 2>&1
```

### بازیابی از پشتیبان

```bash
cd /opt/dadrosebook
dc stop backend worker frontend umami            # جلوگیری از نوشتن هم‌زمان
# پایگاه‌دادهٔ فروشگاه (نام فایل را عوض کنید):
gunzip -c /var/backups/dadrosebook/dadrose-YYYYMMDD-HHMMSS.sql.gz \
  | dc exec -T db psql -U dadrose -d dadrose -v ON_ERROR_STOP=1
# پایگاه‌دادهٔ Umami:
gunzip -c /var/backups/dadrosebook/umami-YYYYMMDD-HHMMSS.sql.gz \
  | dc exec -T db psql -U dadrose -d umami -v ON_ERROR_STOP=1
# فایل‌ها (فقط وقتی USE_S3=false):
dc start backend
dc exec -T backend tar -xzf - -C /app < /var/backups/dadrosebook/media-YYYYMMDD-HHMMSS.tar.gz
dc up -d
deploy/smoke.sh https://dadrosebook.com
```

خروجی‌ها با `--clean --if-exists` ساخته شده‌اند و جدول‌های موجود را جایگزین می‌کنند. اگر روی سرور
تازه بازیابی می‌کنید، اول بخش ۳ را تا `up -d` انجام دهید (پایگاه‌داده‌ها ساخته شوند) و بعد بازیابی کنید.
گاهی یک بازیابی آزمایشی روی سرور دیگر انجام دهید تا از سالم بودن پشتیبان‌ها مطمئن شوید.

## ۱۰. CDN ابرآروان جلوی سایت (اختیاری)

حالت پیش‌فرض: کاربر ← Caddy روی سرور. اگر CDN ابرآروان را فعال کنید (کاربر ← CDN ← Caddy):

1. در پنل CDN، دامنه را اضافه و رکوردهای `@` و `www` را «ابری/پروکسی» کنید. رکورد `stats` می‌تواند
   مستقیم بماند.
2. حالت SSL را روی «HTTPS به مبدأ» بگذارید. Caddy گواهی خودش را از Let's Encrypt می‌گیرد؛ CDN باید
   درخواست‌های `/.well-known/acme-challenge/` را روی HTTP به سرور برساند (پیش‌فرض همین است).
3. در `.env.prod`:

```env
TRUSTED_PROXIES=<بازه‌های IP لبه‌های ابرآروان با فاصله از هم>
NUM_PROXIES=2
```

   فهرست به‌روز بازه‌های IP را از مستندات ابرآروان بردارید. بدون این دو تنظیم، IP واقعی کاربر گم می‌شود
   و محدودیت ارسال فرم‌ها (throttle) همه را یک کاربر حساب می‌کند.
4. اعمال: `dc up -d caddy backend worker`.

حذف CDN: برعکس همین مراحل (`TRUSTED_PROXIES=127.0.0.1/32` و `NUM_PROXIES=1`).

## ۱۱. چک‌لیست انتقال از سازیتو

**یک هفته قبل**

- [ ] TTL رکوردهای DNS دامنه را به ۳۰۰ ثانیه (۵ دقیقه) کاهش دهید.
- [ ] فهرست کامل آدرس‌های فعلی سایت را تهیه کنید: خروجی محصولات/دسته‌ها از پنل سازیتو و
      گزارش «Pages» در Google Search Console (Export). یک کرال با Screaming Frog هم مفید است.
- [ ] سرور جدید را طبق بخش‌های ۳ تا ۶ آماده کنید و با یک زیردامنهٔ موقت (مثلاً
      `new.dadrosebook.com` در `SITE_DOMAIN` + `NEXT_PUBLIC_SITE_ENV=staging` برای جلوگیری از ایندکس)
      همه‌چیز را بررسی کنید.
- [ ] قیمت، موجودی و توضیحات کتاب‌ها را در پنل مدیریت با سازیتو تطبیق دهید.

**روز انتقال**

- [ ] در پنل مدیریت، بخش «سئو» ← ریدایرکت‌ها ← درون‌ریزی CSV، فهرست آدرس‌های قدیمی را با قالب
      `old_path,new_path[,status]` وارد کنید (آدرس‌هایی که مسیرشان عوض نشده لازم نیست).
- [ ] `.env.prod` را با دامنهٔ اصلی و `NEXT_PUBLIC_SITE_ENV=production` تنظیم و فرانت‌اند را دوباره
      بسازید (`dc up -d --build`).
- [ ] رکوردهای DNS (`@`، `www`، `stats`) را به IP سرور جدید تغییر دهید.
- [ ] پس از گرفتن گواهی (`dc logs caddy`) آزمون سریع را اجرا کنید:
      `deploy/smoke.sh https://dadrosebook.com` (شامل بررسی ریدایرکت ۳۰۱ یک آدرس قدیمی).
- [ ] چند آدرس قدیمی محصول و دسته را دستی باز کنید.
- [ ] در Google Search Console نقشهٔ سایت `https://dadrosebook.com/sitemap.xml` را ثبت کنید.

**دو هفتهٔ بعد**

- [ ] هر روز گزارش «۴۰۴» را در بخش «سئو» پنل مدیریت ببینید و برای آدرس‌های پربازدید ریدایرکت بسازید.
- [ ] گزارش Coverage/Pages در Search Console را بررسی کنید.
- [ ] پس از پایدار شدن، TTL را به مقدار عادی (مثلاً ۳۶۰۰) برگردانید و اشتراک سازیتو را لغو کنید
      (تا آن زمان سازیتو را فعال نگه دارید تا بازگشت ممکن باشد).

## ۱۲. بازگشت (Rollback)

**بازگشت به نسخهٔ قبلی کد:**

```bash
cd /opt/dadrosebook
git log --oneline -5
git checkout <commit قبلی>
dc up -d --build
```

اگر نسخهٔ جدید مهاجرت پایگاه‌داده داشته که با نسخهٔ قبلی سازگار نیست، پایگاه‌داده را از پشتیبانِ
گرفته‌شده پیش از به‌روزرسانی بازیابی کنید (بخش ۹). بعد از رفع مشکل: `git checkout main && git pull`.

**بازگشت به سازیتو در روز انتقال:** رکوردهای DNS را به مقدار قبلی (سازیتو) برگردانید؛ با TTL پنج
دقیقه‌ای ظرف چند دقیقه اثر می‌کند. سفارش‌های ثبت‌شده در سایت جدید در این فاصله را دستی پیگیری کنید.

## ۱۳. نگهداری روزمره

| کار | دستور |
|---|---|
| وضعیت سرویس‌ها | `dc ps` |
| لاگ‌ها (چرخش خودکار: ۵ فایل ۱۰ مگابایتی برای هر سرویس) | `dc logs -f --tail 200 backend` |
| خطاهای Django | `dc logs backend \| grep '"level": "ERROR"'` |
| ری‌استارت یک سرویس | `dc restart frontend` |
| شل Django | `dc exec backend python manage.py shell` |
| فضای دیسک | `df -h && docker system df` |

بررسی تنظیمات امنیتی بک‌اند:

```bash
dc exec backend python manage.py check --deploy
```

دو هشدار باقی‌مانده عمدی‌اند: `SECURE_HSTS_INCLUDE_SUBDOMAINS` و `SECURE_HSTS_PRELOAD` خاموش‌اند،
چون ممکن است زیردامنه‌ای بدون HTTPS (مثلاً ایمیل) وجود داشته باشد. اگر همهٔ زیردامنه‌ها HTTPS هستند،
در `.env.prod` روشنشان کنید. ریدایرکت HTTP به HTTPS را Caddy انجام می‌دهد (`SECURE_SSL_REDIRECT=false`).
