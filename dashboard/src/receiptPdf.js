import { LOGO_3A_BASE64 } from './constants/logo';

export const downloadReceiptPdf = async ({ id, rows, amount }) => {
  // jsPDF dimuat saat dibutuhkan agar bundel awal tetap kecil.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [110, 150] });
  const left = 10;
  const right = 100;
  let y = 28;

  const dashedLine = () => {
    doc.setDrawColor(216, 203, 169);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(left, y, right, y);
    doc.setLineDashPattern([], 0);
  };

  // Logo Standar 3A resmi (PNG Base64 seragam dengan aplikasi)
  doc.addImage(LOGO_3A_BASE64, 'PNG', 47, 6, 16, 16);

  doc.setTextColor(36, 45, 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('KOST TIGA A', 55, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(109, 113, 106);
  doc.text('Jatimakmur, Pondok Gede, Bekasi', 55, y, { align: 'center' });
  y += 4;
  doc.text('08990004926', 55, y, { align: 'center' });
  y += 5;
  dashedLine();
  y += 7;

  doc.setFontSize(8.5);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(109, 113, 106);
    doc.text(label, left, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(36, 45, 41);
    const lines = doc.splitTextToSize(String(value), 55);
    doc.text(lines, right, y, { align: 'right' });
    y += Math.max(lines.length, 1) * 4.2 + 2.5;
  }

  y += 1;
  dashedLine();
  y += 8;
  doc.setFillColor(238, 234, 223);
  doc.roundedRect(left, y - 5, right - left, 12, 2, 2, 'F');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 45, 41);
  doc.text('JUMLAH BAYAR:', left, y);
  doc.setFontSize(12);
  doc.setTextColor(31, 48, 40);
  doc.text(amount, right, y, { align: 'right' });
  y += 4;
  dashedLine();
  y += 8;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(53, 76, 63);
  doc.text('Status: LUNAS SAH', left, y);
  doc.setFont('helvetica', 'normal');
  doc.text('Pengelola Kost,', right, y, { align: 'right' });
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 45, 41);
  doc.setDrawColor(180, 170, 150);
  doc.line(75, y - 4, right, y - 4);
  doc.text('Kost Tiga A', right, y, { align: 'right' });

  doc.save(`kuitansi-${id}.pdf`);
};
