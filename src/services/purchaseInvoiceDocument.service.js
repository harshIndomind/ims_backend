const path = require('path');
const { PurchaseInvoiceDocument, PurchaseInvoice } = require('../models/index');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');

function buildS3Key(invoiceId, filename) {
	const ext = path.extname(filename);
	const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
	const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	return `purchase-invoices/${invoiceId}/${unique}-${base}${ext}`;
}

exports.uploadDocuments = async (req, invoiceId, files) => {
	const invoice = await PurchaseInvoice.findByPk(invoiceId);
	if (!invoice) {
		throw new AppError(`Purchase Invoice with ID ${invoiceId} not found`, StatusCodes.NOT_FOUND);
	}

	const user = req.user;
	const uploadedBy = { id: user.id, name: user.name, email: user.email };

	const created = [];
	for (const file of files) {
		const key = buildS3Key(invoiceId, file.originalname);

		await s3.send(
			new PutObjectCommand({
				Bucket: process.env.AWS_BUCKET_NAME,
				Key: key,
				Body: file.buffer,
				ContentType: file.mimetype,
			}),
		);

		const doc = await PurchaseInvoiceDocument.create({
			purchase_invoice_id: invoiceId,
			file_name: file.originalname,
			file_key: key,
			file_type: file.mimetype,
			file_size: file.size,
			storage_type: 's3',
			uploaded_by: uploadedBy,
		});

		created.push(doc);
	}

	return created;
};

exports.getDocuments = async (invoiceId) => {
	const docs = await PurchaseInvoiceDocument.findAll({
		where: { purchase_invoice_id: invoiceId },
		order: [['createdAt', 'ASC']],
	});

	const docsWithUrls = await Promise.all(
		docs.map(async (doc) => {
			const plain = doc.get({ plain: true });
			plain.signed_url = await generateSignedUrl(doc.file_key);
			return plain;
		}),
	);

	return docsWithUrls;
};

exports.deleteDocument = async (invoiceId, docId) => {
	const doc = await PurchaseInvoiceDocument.findOne({
		where: { id: docId, purchase_invoice_id: invoiceId },
	});

	if (!doc) {
		throw new AppError('Document not found', StatusCodes.NOT_FOUND);
	}

	await s3.send(
		new DeleteObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: doc.file_key,
		}),
	);

	await doc.destroy();
};
