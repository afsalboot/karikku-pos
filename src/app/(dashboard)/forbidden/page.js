import PageState from "@/components/ui/page-state";
export default function ForbiddenPage() {
  return (
    <PageState code="403" title="Access not available">
      <p>
        Your account does not have permission to open this page. Ask your shop
        administrator if you need access.
      </p>
    </PageState>
  );
}
