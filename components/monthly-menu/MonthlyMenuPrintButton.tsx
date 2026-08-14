"use client";

export default function MonthlyMenuPrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      列印 / 儲存 PDF
    </button>
  );
}
