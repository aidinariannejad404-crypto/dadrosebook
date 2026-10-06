import { Suspense } from "react";
import RootNotFound from "../../not-found";
import { FacetNotFound } from "@/components/seo/FacetNotFound";

/**
 * 404 inside /category/<slug>: an unknown category gets the site 404 (with the hit beacon); an empty
 * filter combination (package الف۴) gets a short notice with a link back to the unfiltered category.
 */
export default function CategoryNotFound() {
  const fallback = <RootNotFound />;
  return (
    <Suspense fallback={fallback}>
      <FacetNotFound fallback={fallback} />
    </Suspense>
  );
}
