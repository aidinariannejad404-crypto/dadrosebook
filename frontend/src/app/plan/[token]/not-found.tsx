import Link from "next/link";

export default function PlanNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <p className="text-6xl font-black text-primary">۴۰۴</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink">این لینک برنامه مطالعه معتبر نیست</h1>
      <p className="mt-2 leading-8 text-ink-muted">
        ممکن است لینک ناقص کپی شده باشد. از صفحه هر کتاب یا صفحه اصلی می‌توانید در کمتر از یک دقیقه یک برنامه
        تازه و رایگان بسازید.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-12 items-center rounded-control bg-primary px-6 font-bold text-white hover:bg-primary-hover"
      >
        ساختن برنامه تازه
      </Link>
    </div>
  );
}
