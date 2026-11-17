'use client';

import { Printer } from 'lucide-react';

/** Opens the browser's print dialog, where "Save as PDF" produces the report file. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
    >
      <Printer className="size-4" /> Print or save as PDF
    </button>
  );
}
