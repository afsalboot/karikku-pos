// CSS page sizes require two lengths: "80mm auto" is invalid and falls back
// to the printer's default (usually A4). Measure the loaded print document.
export async function printThermalReceipt(iframe) {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) throw new Error("Receipt print window is unavailable");
  const receipts = [...doc.querySelectorAll(".receipt")];
  if (!receipts.length) throw new Error("Receipt content is unavailable");
  const width = receipts[0].style.width === "58mm" ? "58mm" : "80mm";
  const style = doc.createElement("style");
  style.id = "thermal-receipt-page";
  style.textContent = `
    html, body { width: ${width} !important; margin: 0 !important; padding: 0 !important; background: white !important; }
    body > div, .invoice-print-sheet { width: ${width} !important; max-width: none !important; margin: 0 !important; padding: 0 !important; animation: none !important; transform: none !important; opacity: 1 !important; box-shadow: none !important; }
    .receipt { width: ${width} !important; max-width: none !important; box-sizing: border-box !important; padding: 3mm !important; margin: 0 !important; }
    .receipt-extra-copy { display: block !important; break-before: page; }
    .receipt, .receipt * { animation: none !important; opacity: 1 !important; color: black !important; }
  `;
  doc.head.appendChild(style);
  await doc.fonts?.ready;
  await Promise.all([...doc.images].map(img => img.decode().catch(() => {})));
  // Round up and allow 2mm for browser print rounding, preventing a blank tail page.
  const heightMm = Math.ceil(Math.max(...receipts.map(el => el.scrollHeight)) * 25.4 / 96) + 2;
  style.textContent += `\n@page { size: ${width} ${heightMm}mm; margin: 0; }`;
  win.focus();
  win.print();
}
