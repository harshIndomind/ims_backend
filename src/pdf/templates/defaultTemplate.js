const moment = require('moment');
const numeral = require('numeral');

exports.renderTemplate = async (doc, invoice) => {
	const { customerInfo, invoiceDetail, productItems } = invoice;

	// Header
	doc.fontSize(20).text("TAX INVOICE", { align: 'center' });
	doc.moveDown();

	doc.fontSize(10).text(`Invoice No: ${invoiceDetail?.invoiceNumber || 'N/A'}`);
	doc.text(`Date: ${moment(invoice.createdAt).format('DD-MM-YYYY')}`);
	doc.text(`Due Date: ${moment(invoice.dueDate).format('DD-MM-YYYY')}`);
	doc.moveDown();

	// Customer Info
	doc.fontSize(12).text("Billed To:", { underline: true });
	doc.fontSize(10)
		.text(customerInfo?.name || 'N/A')
		.text(customerInfo?.address || '')
		.text(customerInfo?.email || '')
		.moveDown();

	// Table Header
	doc.font('Helvetica-Bold').text('S.No', 50)
		.text('Product', 100)
		.text('Qty', 250)
		.text('Price', 300)
		.text('Total', 400);
	doc.moveDown(0.5);
	doc.font('Helvetica').moveTo(40, doc.y).lineTo(550, doc.y).stroke();
	doc.moveDown(0.5);

	// Table Rows
	productItems.forEach((item, index) => {
		const total = parseFloat(item.qty) * parseFloat(item.price);
		doc.font('Helvetica')
			.text(index + 1, 50)
			.text(item.product?.name || 'N/A', 100)
			.text(item.qty.toString(), 250)
			.text(numeral(item.price).format('0,0.00'), 300)
			.text(numeral(total).format('0,0.00'), 400);
		doc.moveDown(0.3);
	});

	doc.moveDown(1);
	doc.font('Helvetica-Bold')
		.text(`Total Taxable: ${numeral(invoice.total_taxable).format('0,0.00')}`, { align: 'right' })
		.text(`Total Tax: ${numeral(invoice.total_tax).format('0,0.00')}`, { align: 'right' })
		.text(`Grand Total: ${numeral(invoice.grandTotal).format('0,0.00')}`, { align: 'right' });

	doc.moveDown(1);
	doc.font('Helvetica').fontSize(9).text(invoice.additionalNotes || '', { align: 'left' });

	doc.moveDown(1);
	doc.text('Thank you for your business!', { align: 'center' });
};
