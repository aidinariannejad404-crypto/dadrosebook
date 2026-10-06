import { cookies } from "next/headers";
import { EXAM_COOKIE, parseExamSlug } from "./exam-cookie";

/** The visitor's «آزمون من» slug from the `exam` cookie (P1-3). Makes the calling route dynamic. */
export async function selectedExamSlug(): Promise<string | null> {
  return parseExamSlug((await cookies()).get(EXAM_COOKIE)?.value);
}
