"use client";
import PageState from "@/components/ui/page-state";
export default function ErrorPage({ retry }) {
  return (
    <PageState
      code="Error"
      title="Unable to load this page"
      action={
        <button className="button primary" onClick={retry}>
          Try again
        </button>
      }
    >
      <p>
        We could not load the workspace. Check your connection and try again. If
        the problem continues, let your shop administrator know which action
        failed.
      </p>
    </PageState>
  );
}
