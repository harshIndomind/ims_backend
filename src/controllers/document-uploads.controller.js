const {
	DocumentsUpload,
	sequelize,
	docs_category,
	User,
	Role,
	organization,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');
const path = require('path');
const AppError = require('../utils/AppError');

exports.uploadADocument = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const user_id = req.user.id;
		const { doc_number, docCatgoryId } = req.body;
		const attachment = req.file;

		if (!doc_number || !docCatgoryId) {
			throw new AppError('All fields are required.', 409);
		}

		if (doc_number.trim() == '') {
			throw new AppError('Document number is required.', 409);
		}

		if (await isDocumentExists(user_id, docCatgoryId, doc_number)) {
			throw new AppError(
				'Sorry! The document you are trying to upload already exists. Please contact the admin.',
				409
			);
		}

		const currentUser = await User.findOne({
			where: { id: user_id },
			include: [
				{
					model: Role,
					attributes: ['name'],
				},
				{
					model: organization,
					as: 'organization',
					attributes: ['org_name', 'org_code'],
				},
			],
		});

		if (!currentUser) {
			throw new AppError('Vendor details not found!', 404);
		}

		if (currentUser.Role.name === 'Super Admin') {
			throw new AppError(
				'Super Admins cannot upload documents because they are not associated with any organization.',
				403
			);
		}

		const docCategory = await docs_category.findOne({
			where: { id: docCatgoryId },
		});

		if (!docCategory) {
			throw new AppError('Document category not found!', 404);
		}

		// [ORG_CODE]_[VENDOR_CODE]_[DOC_SHORTCODE]_[DOC_NUMBER_BY_USER]
		const ORG_CODE = currentUser.organization.org_code;
		const VENDOR_CODE = currentUser.vendor_company_code;
		const DOC_SHORTCODE = docCategory.short_code;
		const DOC_NUMBER_BY_USER = doc_number;
		const documentName = `${ORG_CODE}_${VENDOR_CODE}_${DOC_SHORTCODE}_${DOC_NUMBER_BY_USER}`;

		const org_filename = attachment.originalname;

		const folderName = docCategory.s3_folder_path || 'default-uploads'; // e.g., "invoices", "users", etc.

		const d = new Date();
		const todayDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
			2,
			'0'
		)}-${String(d.getDate()).padStart(2, '0')}`;

		const extension = path.extname(org_filename); // e.g., '.png'
		const generated_filename = `${documentName}${extension}`;

		const fullPath = `${folderName}/${generated_filename}`;

		const uploadParams = {
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: fullPath,
			Body: attachment.buffer,
			ContentType: attachment.mimetype,
		};

		const result = await s3.send(new PutObjectCommand(uploadParams));

		const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folderName}/${generated_filename}`;

		console.log('S3 result => ', result);

		const DocsCategory = await DocumentsUpload.create({
			user_id,
			doc_number,
			org_filename,
			generated_filename,
			doc_id: docCatgoryId,
			uploaded_path: fullPath,
		});

		await t.commit();

		res.status(201).json({
			status: true,
			message: 'Document uploaded successfully',
			data: DocsCategory,
		});
	} catch (error) {
		await t.rollback();
		console.error('Error in uploading document:', error);
		res.status(500).json({
			status: false,
			message: error.message || 'Failed to upload a document',
			error: error.message,
		});
	}
});

exports.updateDocsCategory = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		const { name, short_code } = req.body;

		const [updatedCount] = await DocumentsUpload.update(
			{
				name,
				short_code,
			},
			{
				where: { id },
			}
		);

		if (updatedCount === 0) {
			return res
				.status(404)
				.json({ message: 'DocsCategory not found or no changes' });
		}

		res.json({ message: 'DocsCategory updated successfully' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.getAUploadedDoc = catchAsync(async (req, res) => {
	const { key } = req.params;
	const DocsCategory = await DocumentsUpload.findOne({ where: { id } });
	res.json(DocsCategory);
});

exports.getDocumentSignedURL = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		// Validate ID presence
		if (!id) {
			return res
				.status(400)
				.json({ status: false, message: 'Document ID is required.' });
		}

		// Fetch document record
		const DocsCategory = await DocumentsUpload.findOne({ where: { id } });

		if (!DocsCategory) {
			return res
				.status(404)
				.json({ status: false, message: 'Document not found.' });
		}

		// Get full S3 key path
		const key = await getS3FullPath(DocsCategory.generated_filename);
		console.log('getDocumentSignedURL:', key);

		// Generate signed URL
		const signedURL = await generateSignedUrl(key);

		// Send response
		res.status(200).json({
			status: true,
			message: 'Document URL fetched successfully',
			data: signedURL,
		});
	} catch (error) {
		console.error('Error in getDocumentSignedURL:', error);
		res.status(error.statusCode || 500).json({
			status: false,
			message: error.message || 'Failed to fetch document signed URL.',
		});
	}
});

exports.getAllUploadedDocs = catchAsync(async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;
		const vendorId = parseInt(req.query.selectedVendorId) || 0;

		const { role, id } = req.user;

		let columns = [];
		let wheres = {};

		if (role == 'Vendor') {
			columns = [
				'id',
				'user_id',
				'doc_id',
				'doc_number',
				'org_filename',
				'generated_filename',
				'isDeleteRequest',
				'doc_status',
				'createdAt',
				'updatedAt',
			];
			wheres['user_id'] = id;
		} else {
			columns = [
				'id',
				'user_id',
				'doc_id',
				'doc_number',
				'org_filename',
				'generated_filename',
				'uploaded_path',
				'isDeleteRequest',
				'doc_status',
				'createdAt',
				'updatedAt',
			];

			if (vendorId > 0) wheres['user_id'] = vendorId;
		}
		console.log('wheres ', wheres);

		const allDocuments = await DocumentsUpload.findAndCountAll({
			where: wheres,
			attributes: columns,
			include: [
				{
					model: User,
					as: 'vendor',
					attributes: ['name', 'vendor_company_name'],
				}
			],
			offset,
			limit,
			order: [['id', 'DESC']],
		});

		res.status(200).json({
			status: true,
			message: 'Uploaded documents fetched successfully',
			data: allDocuments,
		});
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.deleteUploadedDoc = catchAsync(async (req, res) => {
	const { id } = req.params;

	const uploadedDocDetails = await DocumentsUpload.findByPk(id);

	if (!uploadedDocDetails) {
		throw new AppError('Document not exists.');
	}

	const key = uploadedDocDetails.uploaded_path;

	if (!key) {
		return res
			.status(400)
			.json({ status: true, message: `File key is required.`, data: null });
	}

	try {
		const command = new DeleteObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: key,
		});

		await s3.send(command);

		await DocumentsUpload.destroy({ where: { id } });

		res.json({
			status: true,
			message: `File '${key}' deleted successfully.`,
			data: null,
		});
	} catch (err) {
		console.error('Error deleting file:', err);
		res
			.status(500)
			.json({ status: false, message: 'Failed to delete file', data: null });
	}
});

async function isDocumentExists(
	user_id = null,
	doc_id = null,
	doc_number = null
) {
	if (!user_id || !doc_id || !doc_number) {
		throw new AppError('Something went wrong!', 400);
	}

	const isExists = await DocumentsUpload.findOne({
		where: {
			user_id,
			doc_id,
			doc_number,
		},
	});

	return !!isExists;
}

exports.getIssuesCounts = catchAsync(async (req, res) => {
	const user_id = req.user.id;
	const user_role = req.user.role;

	let whereClause = {};

	if (user_role === 'Project Tech Head') {
		// Get project IDs assigned to this user
		const user = await User.findByPk(user_id, {
			include: {
				model: UserProject,
				as: 'UserProjects',
				include: {
					model: Project,
					attributes: ['id'],
				},
			},
		});

		const projectIds = user.UserProjects.map((up) => up.Project?.id).filter(
			Boolean
		);
		whereClause.projectId = projectIds.length > 0 ? projectIds : null;
	} else if (user_role === 'User') {
		whereClause.reporterId = user_id;
	} else if (user_role === 'Support Engineer') {
		whereClause.assigneeId = user_id;
	}
	// Admin gets no filter

	const issuesCounts = await Issue.findAll({
		where: whereClause,
		attributes: ['status', [fn('COUNT', col('status')), 'count']],
		group: ['status'],
		raw: true,
	});

	// Convert to map for easier lookup
	const countsMap = issuesCounts.reduce((acc, item) => {
		acc[item.status] = parseInt(item.count, 10);
		return acc;
	}, {});

	// Ensure all statuses are present
	const allStatuses = ['open', 'in_progress', 'resolved', 'closed'];
	const result = allStatuses.reduce((acc, status) => {
		acc[status] = countsMap[status] || 0;
		return acc;
	}, {});

	console.log('result', result);

	res.status(200).json({
		status: true,
		message: 'Issues counts fetched successfully',
		data: result,
	});
});

exports.sendDeleteRequestToAdmin = catchAsync(async (req, res) => {
	const { id } = req.params;

	const uploadedDocDetails = await DocumentsUpload.findByPk(id);

	if (!uploadedDocDetails) {
		throw new AppError('Document not exists.');
	}

	const [updatedCount] = await DocumentsUpload.update(
		{ isDeleteRequest: true },
		{ where: { id } }
	);

	if (updatedCount === 0) {
		return res
			.status(404)
			.json({ status: false, message: 'DocsCategory not found or no changes' });
	}

	return res.status(200).json({
		status: true,
		message: 'A document delete request is sent to admin.',
	});
});

async function getS3FullPath(generated_filename = null) {
	try {
		if (!generated_filename) {
			throw new AppError(`Filename is required`, 404);
		}
		const uploadedDoc = await DocumentsUpload.findOne({
			where: {
				generated_filename: generated_filename,
			},
		});

		if (!uploadedDoc) {
			throw new AppError(
				`Document not found by the filename: ${generated_filename}`,
				404
			);
		}

		const docCategory = await docs_category.findOne({
			where: { id: uploadedDoc.doc_id },
		});

		if (!docCategory) {
			throw new AppError(
				`Document category not found for the filename: ${generated_filename}`,
				404
			);
		}

		console.log("uploadedDoc ", JSON.stringify(uploadedDoc, null, ''));
		

		const key = `${docCategory.s3_folder_path}${getFolderLocationStatusWise(
			uploadedDoc.doc_status
		)}${uploadedDoc.generated_filename}`;
		console.log("key ", uploadedDoc.doc_status);
		
		return key;
	} catch (error) {
		throw new AppError(
			error.message || 'Something went wrong while fetching the document path.',
			500
		);
	}
}

function getFolderLocationStatusWise(doc_status = 'UPLOADED') {
	const map = {
		UPLOADED: '/',
		'IN-PROCESS': '/inprocess/',
		DUPLICATE: '/duplicates/',
		FAILED: '/failed/',
		RESULT: '/results/',
	};

	return map[doc_status] || '/';
}

exports.updateDocumentStatus = catchAsync(async (req, res) => {
	try {
		const { generated_filename, status } = req.body;

		if (!generated_filename || !status) {
			return res.status(400).json({
				status: false,
				message: "Filename and status are required",
			});
		}

		const validStatuses = ['UPLOADED', 'IN-PROCESS', 'DUPLICATE', 'FAILED', 'RESULT'];

		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				status: false,
				message: "Invalid status",
			});
		}

		const updated = await DocumentsUpload.update(
			{ doc_status: status },
			{ where: { generated_filename } }
		);

		if (updated[0] === 0) {
			return res.status(404).json({
				status: false,
				message: "Document not found",
			});
		}

		res.status(200).json({
			status: true,
			message: "Document status updated successfully",
		});
	} catch (error) {
		res.status(500).json({
			status: false,
			message: error.message || "Something went wrong",
		});
	}
});
