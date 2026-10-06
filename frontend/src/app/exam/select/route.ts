import { examSetCookie, parseExamSlug } from "@/lib/exam-cookie";

/**
 * «آزمون من» (P1-3). The homepage exam chips are a plain <form method="post" action="/exam/select">
 * (no client JS): store the chosen slug in the `exam` cookie — or clear it when empty — and
 * send the visitor back to the homepage, which now renders for that exam.
 * (Moved from POST /exam in package ب, so /exam/<slug> can be the exam hub; /exam still accepts
 * the POST for pages cached before the move.)
 */
export async function POST(request: Request): Promise<Response> {
  let raw: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("exam");
    raw = typeof value === "string" ? value : null;
  } catch {
    raw = null;
  }
  const slug = parseExamSlug(raw);
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/#exam",
      "Set-Cookie": examSetCookie(slug, proto === "https"),
      "Cache-Control": "no-store",
    },
  });
}

export function GET(): Response {
  return new Response(null, { status: 307, headers: { Location: "/" } });
}
