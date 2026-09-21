import PageState from "@/components/ui/page-state";
export default function NotFound() {
  return (
    <PageState code="404" title="Page not found">
      <p>
        This destination does not exist. Check the address or return to your
        workspace.
      </p>
    </PageState>
  );
}
