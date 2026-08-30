import { jsPDF } from 'jspdf';

// Renders a markdown-flavored incident report into a clean, paginated PDF.
// Only needs to handle the same subset of markdown the AI consistently
// produces: #/##/### headers, "- " bullet lists, and plain paragraphs.
function buildIncidentReportPdf(opts: {
  deploymentName: string;
  generatedAt: string;
  reportText: string;
}) {
  const { deploymentName, generatedAt, reportText } = opts;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const maxWidth = pageWidth - marginX * 2;
  let y = 64;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - 56) {
      doc.addPage();
      y = 64;
    }
  };

  // Cover header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 30);
  doc.text(`Incident Report`, marginX, y);
  y += 26;

  doc.setFontSize(14);
  doc.setTextColor(90, 90, 110);
  doc.text(deploymentName, marginX, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(140, 140, 155);
  doc.text(`Generated ${new Date(generatedAt).toLocaleString()}`, marginX, y);
  y += 10;

  doc.setDrawColor(225, 225, 235);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  const lines = (reportText || '').replace(/\r\n/g, '\n').split('\n');

  const stripBold = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1');

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^#\s+/.test(line)) {
      ensureSpace(30);
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(25, 25, 35);
      const text = stripBold(line.replace(/^#\s+/, ''));
      doc.text(text, marginX, y);
      y += 6;
      doc.setDrawColor(230, 230, 240);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 18;
    } else if (/^##\s+/.test(line)) {
      ensureSpace(24);
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(99, 102, 241);
      doc.text(stripBold(line.replace(/^##\s+/, '')).toUpperCase(), marginX, y);
      y += 16;
    } else if (/^###\s+/.test(line)) {
      ensureSpace(20);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 50);
      doc.text(stripBold(line.replace(/^###\s+/, '')), marginX, y);
      y += 14;
    } else if (/^[-*]\s+/.test(line)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 72);
      const text = stripBold(line.replace(/^[-*]\s+/, ''));
      const wrapped = doc.splitTextToSize(text, maxWidth - 14);
      ensureSpace(wrapped.length * 14 + 4);
      doc.text('•', marginX, y);
      doc.text(wrapped, marginX + 14, y);
      y += wrapped.length * 14 + 2;
    } else if (line.trim() === '') {
      y += 6;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 72);
      const text = stripBold(line);
      const wrapped = doc.splitTextToSize(text, maxWidth);
      ensureSpace(wrapped.length * 14 + 4);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 14 + 4;
    }
  }

  return doc;
}

export function downloadIncidentReportPdf(opts: {
  deploymentName: string;
  generatedAt: string;
  reportText: string;
}) {
  const doc = buildIncidentReportPdf(opts);
  const safeName = opts.deploymentName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  doc.save(`incident-report-${safeName}.pdf`);
}

// Builds the PDF and returns an object URL for inline preview (e.g. in a
// modal <iframe>), plus a save() helper and the underlying filename. Caller
// is responsible for revoking the URL (URL.revokeObjectURL) when done.
export function buildIncidentReportPdfPreview(opts: {
  deploymentName: string;
  generatedAt: string;
  reportText: string;
}) {
  const doc = buildIncidentReportPdf(opts);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const safeName = opts.deploymentName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  const filename = `incident-report-${safeName}.pdf`;
  return {
    url,
    filename,
    save: () => doc.save(filename),
    revoke: () => URL.revokeObjectURL(url),
  };
}
