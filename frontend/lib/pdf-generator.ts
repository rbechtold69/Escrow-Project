import jsPDF from 'jspdf';

interface WiringInstructions {
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  bankAddress: string;
  beneficiaryName: string;
  reference: string;
}

interface EscrowData {
  escrowId: string;
  propertyAddress: string;
  purchasePrice: number;
  buyerName: string;
  sellerName: string;
  wiringInstructions: WiringInstructions;
}

export function generateWiringInstructionsPDF(escrow: EscrowData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 20;

  // Helper for centered text
  const centerText = (text: string, yPos: number, fontSize: number = 12) => {
    doc.setFontSize(fontSize);
    const textWidth = doc.getTextWidth(text);
    doc.text(text, (pageWidth - textWidth) / 2, yPos);
  };

  // Header
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  centerText('WIRE TRANSFER INSTRUCTIONS', 25);
  doc.setFontSize(10);
  centerText('EscrowPayi - Secure Real Estate Escrow', 35);

  // Reset text color
  doc.setTextColor(0, 0, 0);
  y = 55;

  // Security warning
  doc.setFillColor(254, 243, 199); // yellow-100
  doc.rect(margin, y, pageWidth - margin * 2, 25, 'F');
  doc.setFontSize(9);
  doc.setTextColor(146, 64, 14); // yellow-800
  doc.text('⚠️ IMPORTANT SECURITY NOTICE', margin + 5, y + 8);
  doc.setFontSize(8);
  doc.text('Always verify wire instructions by calling our office directly before sending funds.', margin + 5, y + 16);
  doc.text('Never trust instructions received only via email. Wire fraud is common in real estate.', margin + 5, y + 22);
  doc.setTextColor(0, 0, 0);
  y += 35;

  // Escrow Details Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ESCROW DETAILS', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 8;

  doc.setFontSize(10);
  const escrowDetails = [
    ['Escrow Number:', escrow.escrowId],
    ['Property Address:', escrow.propertyAddress],
    ['Purchase Price:', `$${escrow.purchasePrice.toLocaleString()}`],
    ['Buyer:', escrow.buyerName],
    ['Seller:', escrow.sellerName],
  ];

  escrowDetails.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 45, y);
    y += 7;
  });

  y += 10;

  // Wire Instructions Section
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y - 5, pageWidth - margin * 2, 65, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('WIRE TRANSFER INFORMATION', margin + 5, y + 5);
  doc.setFont('helvetica', 'normal');
  y += 15;

  const wireInfo = [
    ['Bank Name:', escrow.wiringInstructions.bankName],
    ['Bank Address:', escrow.wiringInstructions.bankAddress],
    ['Routing Number (ABA):', escrow.wiringInstructions.routingNumber],
    ['Account Number:', escrow.wiringInstructions.accountNumber],
    ['Beneficiary Name:', escrow.wiringInstructions.beneficiaryName],
    ['Reference/Memo:', escrow.wiringInstructions.reference],
  ];

  doc.setFontSize(10);
  wireInfo.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 55, y);
    y += 8;
  });

  y += 15;

  // Instructions
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('NEXT STEPS', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 8;

  doc.setFontSize(9);
  const instructions = [
    '1. Take these instructions to your bank or use online wire transfer.',
    '2. Include the Reference/Memo exactly as shown above.',
    '3. Keep confirmation number for your records.',
    '4. Funds typically arrive within 1-2 business days.',
    '5. You will receive email confirmation when deposit is received.',
  ];

  instructions.forEach((text) => {
    doc.text(text, margin, y);
    y += 6;
  });

  y += 10;

  // Footer
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 270, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  centerText('EscrowPayi - Blockchain-Secured Real Estate Escrow', 280);
  centerText(`Generated: ${new Date().toLocaleString()} | Document ID: ${escrow.escrowId}`, 287);

  // Save the PDF
  doc.save(`wiring-instructions-${escrow.escrowId}.pdf`);
}
