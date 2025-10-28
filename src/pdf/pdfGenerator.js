const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * @param {Object} invoice - Invoice data with items, customer, etc.
 * @param {string} template - template name e.g. 'defaultTemplate'
 * @returns {string} pdfPath
 */
exports.generateInvoicePDF = async (invoice, template = 'defaultTemplate') => {
	const { renderTemplate } = require(`./templates/${template}`);

	const pdfDir = path.join(__dirname, '../../storage/invoices');
	if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

	const pdfPath = path.join(pdfDir, `invoice_${invoice.id}.pdf`);
	const doc = new PDFDocument({ margin: 40, size: 'A4' });
	doc.pipe(fs.createWriteStream(pdfPath));

	await renderTemplate(doc, invoice); // ⬅️ Template renderer

	doc.end();
	return pdfPath;
};
