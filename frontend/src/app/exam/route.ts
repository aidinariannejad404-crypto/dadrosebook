/**
 * Bare /exam: the «آزمون من» POST moved to /exam/select (package ب, /exam/<slug> is the exam hub).
 * POST is still accepted here for homepage HTML cached before the move; GET goes home.
 */
export { GET, POST } from "./select/route";
