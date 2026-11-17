export async function renderPdf(template: unknown) {
  if (typeof template !== "string" || !template) {
    return { status: 400, body: { error: "template is required" } };
  }

  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(template, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        landscape: false,
        scale: 0.9,
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });
      const data = `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
      return { status: 200, body: { success: true, data } };
    } finally {
      await browser.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed";
    console.error("getPdf error:", err);
    return { status: 500, body: { success: false, message } };
  }
}
