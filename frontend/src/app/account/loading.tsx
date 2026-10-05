import { AccountContentSkeleton } from "@/components/skeletons/RouteSkeletons";

/** Rendered inside the account layout (header + nav stay put); covers every /account/* page. */
export default function Loading() {
  return <AccountContentSkeleton />;
}
