const path = require('path');
const { IndentDocument, Indent } = require('../models/index');
const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');

function buildS3Key(indentId, filename) {
	const ext = path.extname(filename);
	const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
	const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
	return `indents/${indentId}/${unique}-${base}${ext}`;
}

exports.uploadDocuments = async (req, indentId, files) => {
	const indent = await Indent.findByPk(indentId);
	if (!indent) {
		throw new AppError(`Indent with ID ${indentId} not found`, StatusCodes.NOT_FOUND);
	}

	const user = req.user;
	const uploadedBy = { id: user.id, name: user.name, email: user.email };

	const created = [];
	for (const file of files) {
		const key = buildS3Key(indentId, file.originalname);

		await s3.send(
			new PutObjectCommand({
				Bucket: process.env.AWS_BUCKET_NAME,
				Key: key,
				Body: file.buffer,
				ContentType: file.mimetype,
			}),
		);

		const doc = await IndentDocument.create({
			indent_id: indentId,
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

exports.getDocuments = async (indentId) => {
	const docs = await IndentDocument.findAll({
		where: { indent_id: indentId },
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

exports.deleteDocument = async (indentId, docId) => {
	const doc = await IndentDocument.findOne({
		where: { id: docId, indent_id: indentId },
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
