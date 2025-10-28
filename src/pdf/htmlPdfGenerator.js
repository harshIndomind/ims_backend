const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const { BASE_URL } = require('../config/serverConfig');

/**
 * Generate Invoice PDF from HTML (EJS template)
 * @param {Object} invoice - invoice data
 * @param {String} templateName - e.g. 'defaultTemplate'
 * * @param {String} baseUrl - e.g. 'http://localhost:5000'
 * @returns {String} pdfPath
 */
// exports.generateInvoiceHTMLPDF = async (
// 	invoice,
// 	templateName = 'defaultTemplate',
// 	baseUrl = BASE_URL || 'http://localhost:5000'
// ) => {
// 	const templatePath = path.join(__dirname, `./templates/${templateName}.ejs`);
// 	const html = await ejs.renderFile(templatePath, { invoice });

// 	const outputDir = path.join(__dirname, '../../storage/invoices');
// 	if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// 	const now = new Date();
// 	const formatted = `${now.getFullYear()}-${(now.getMonth() + 1)
// 		.toString()
// 		.padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now
// 		.getHours()
// 		.toString()
// 		.padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now
// 		.getSeconds()
// 		.toString()
// 		.padStart(2, '0')}`;

// 	const fileName = `invoice_${invoice.id}_${formatted}.pdf`;

// 	const pdfPath = path.join(outputDir, fileName);

// 	const browser = await puppeteer.launch({ headless: 'new' });
// 	const page = await browser.newPage();

// 	await page.setContent(html, { waitUntil: 'networkidle0' });
// 	await page.pdf({
// 		path: pdfPath,
// 		format: 'A4',
// 		margin: { top: '30px', right: '30px', bottom: '30px', left: '30px' },
// 		printBackground: true,
// 	});

// 	await browser.close();

// 	const pdfUrl = `${baseUrl}/storage/invoices/${fileName}`;
// 	return pdfUrl;
// };

exports.generateInvoiceHTML = async (
	invoice,
	templateName = 'defaultTemplate'
) => {
	const templatePath = path.join(__dirname, `./templates/${templateName}.ejs`);
	const html = await ejs.renderFile(templatePath, { invoice });
	return html;
};

exports.generateInvoiceHTMLPDF = async (dataOrHtml, template, options = {}) => {
	const isHtml = options.multi === true;
	const html = isHtml
		? dataOrHtml // already full HTML
		: await generateInvoiceHTML(dataOrHtml, template);

	const now = new Date();
	const formatted = `${now.getFullYear()}-${(now.getMonth() + 1)
		.toString()
		.padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now
		.getHours()
		.toString()
		.padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now
		.getSeconds()
		.toString()
		.padStart(2, '0')}`;

	const pdfName = `invoice_${formatted}.pdf`;

	const pdfPath = path.join(__dirname, `../../storage/invoices/${pdfName}`);

	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	await page.setContent(html, { waitUntil: 'networkidle0' });
	await page.pdf({
		path: pdfPath,
		format: 'A4',
		printBackground: true,
		margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
	});

	await browser.close();

	const baseUrl = BASE_URL || 'http://localhost:5000'

	return `${baseUrl}/storage/invoices/${pdfName}`;
};
