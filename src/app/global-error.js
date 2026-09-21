"use client";
import "./globals.css";
import "./production-states.css";
import PageState from "@/components/ui/page-state";
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body>
        <PageState
          code="Error"
          title="The application could not load"
          action={
            <button className="button primary" onClick={retry}>
              Try again
            </button>
          }
        >
          <p>
            Please try again. If this keeps happening, ask your shop
            administrator for assistance.
          </p>
        </PageState>
      </body>
    </html>
  );
}
