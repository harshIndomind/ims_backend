const {
	DocumentsUpload,
	sequelize,
	docs_category,
	User,
	Role,
	organization,
	Alert,
	BusinessPartner,
	InvoiceCsvImport,
	InvoiceCsvImportItem,
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
const { sendToUser } = require('../utils/socket');
const { Op } = require('sequelize');
const moment = require('moment-timezone');
const axios = require('axios');

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

		const currentUser = await BusinessPartner.findOne({
			where: { user_id },
			include: [
				{
					model: User,
					as: 'user', // ✅ must match association alias
					attributes: ['id', 'name', 'email'],
					include: [
						{
							model: Role,
							attributes: ['name'],
						},
					],
				},
				{
					model: organization,
					as: 'organization',
					attributes: ['org_name', 'org_code'],
				},
			],
		});

		console.log('currentUser ', currentUser);

		if (!currentUser) {
			throw new AppError('Vendor details not found!', 404);
		}

		if (await isDocumentExists(currentUser.id, docCatgoryId, doc_number)) {
			throw new AppError(
				'Sorry! The document you are trying to upload already exists. Please contact the admin.',
				409
			);
		}

		if (currentUser.user.Role.name === 'Super Admin') {
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
		const VENDOR_CODE = currentUser.code;
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
			partner_id: currentUser.id,
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
	const { id } = req.params;
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
		const vendorUserId = parseInt(req.query.selectedVendorId) || 0;

		const { role, id } = req.user;

		const businessPartner = await BusinessPartner.findOne({
			where: { user_id: id },
		});

		let columns = [];
		let wheres = {};

		if (role == 'Vendor') {
			columns = [
				'id',
				'partner_id',
				'doc_id',
				'doc_number',
				'org_filename',
				'generated_filename',
				'isDeleteRequest',
				'doc_status',
				'createdAt',
				'updatedAt',
			];
			wheres['partner_id'] = businessPartner.id;
		} else {
			columns = [
				'id',
				'partner_id',
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

			if (vendorUserId > 0) {
				const businessPartner = await BusinessPartner.findOne({
					where: { user_id: vendorUserId },
				});

				if (!businessPartner) {
					throw new AppError('Invalid vendor');
					return;
				}

				wheres['partner_id'] = businessPartner.id;
			}
		}
		console.log('wheres ', wheres);

		const allDocuments = await DocumentsUpload.findAndCountAll({
			where: wheres,
			attributes: columns,
			include: [
				{
					model: BusinessPartner,
					as: 'vendor', // must match DocumentsUpload association
					attributes: ['id', 'name', 'code', 'contact_no'],
					include: [
						{
							model: User,
							as: 'user', // must match BusinessPartner association
							attributes: ['id', 'name', 'email'],
						},
					],
				},
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
	partner_id = null,
	doc_id = null,
	doc_number = null
) {
	if (!partner_id || !doc_id || !doc_number) {
		throw new AppError('Something went wrong!', 400);
	}

	const isExists = await DocumentsUpload.findOne({
		where: {
			partner_id,
			doc_id,
			doc_number,
		},
	});

	return isExists ? true : false;
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

		const key = `${docCategory.s3_folder_path}${getFolderLocationStatusWise(
			uploadedDoc.doc_status
		)}${uploadedDoc.generated_filename}`;

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

function getStatusMapping(doc_status = 'UPLOADED') {
	const map = {
		UPLOADED: 'uploaded',
		'IN-PROCESS': 'in-process',
		DUPLICATE: 'duplicate',
		FAILED: 'failed',
		RESULT: 'results',
	};

	return map[doc_status] || '/';
}

exports.updateDocumentStatus = catchAsync(async (req, res) => {
	try {
		const { generated_filename, status } = req.body;
		if (!generated_filename || !status) {
			return res.status(400).json({
				status: false,
				message: 'Filename and status are required',
			});
		}

		const validStatuses = [
			'UPLOADED',
			'IN-PROCESS',
			'DUPLICATE',
			'FAILED',
			'RESULT',
		];

		if (!validStatuses.includes(status)) {
			return res.status(400).json({
				status: false,
				message: 'Invalid status',
			});
		}

		const docDetails = await DocumentsUpload.findOne({
			where: { generated_filename },
			include: [
				{
					model: BusinessPartner,
					as: 'vendor', // must match DocumentsUpload association
					attributes: ['id', 'name', 'code', 'contact_no', 'user_id'],
					include: [
						{
							model: User,
							as: 'user', // must match BusinessPartner association
							attributes: ['id', 'name', 'email'],
						},
					],
				},
			],
		});

		if (!docDetails) {
			return res.status(404).json({
				status: false,
				message: 'Document not found',
			});
		}

		const updated = await DocumentsUpload.update(
			{ doc_status: status },
			{ where: { generated_filename } }
		);

		console.log('docDetails User Name ', docDetails.vendor.name);

		if (updated[0] === 0) {
			return res.status(404).json({
				status: false,
				message: 'Document not found',
			});
		}

		if (['RESULT', 'FAILED', 'DUPLICATE'].includes(status)) {
			console.log('-----------------------------------------------------');
			await importDocumentCSV(generated_filename, status);
		}

		const description = `Vendor: ${
			docDetails.vendor.name
		}, Filename: ${generated_filename} file status changed to ${getStatusMapping(
			status
		)}.`;

		const alert = await Alert.create({
			title: 'Status Updated',
			user_id: docDetails.vendor.user.id,
			description,
			createdAt: moment().tz('Asia/Kolkata').toDate(), // ✅ IST time
		});

		const allAdmins = await User.findAll({
			include: [
				{
					model: Role,
					attributes: ['name'],
					where: {
						name: { [Op.in]: ['Super Admin', 'Admin'] },
					},
				},
			],
			attributes: ['id'],
		});

		const allIds = [...allAdmins.map((a) => a.id), docDetails.vendor.user.id];

		for (const id of allIds) {
			sendToUser(id, 'new_alert', alert);
		}

		res.status(200).json({
			status: true,
			message: 'Document status updated successfully',
		});
	} catch (error) {
		res.status(500).json({
			status: false,
			message: error.message || 'Something went wrong',
		});
	}
});

async function importDocumentCSV(generated_filename, status) {
	const t = await sequelize.transaction(); // ✅ You missed await here
	try {
		const key = await getS3FullPath(generated_filename);
		const signedURL = await generateSignedUrl(`${key}.json`);

		const { data } = await axios.get(signedURL);

		let jsonData;

		// ✅ Validate JSON properly
		try {
			jsonData = JSON.parse(data);
		} catch (err) {
			throw new Error('Invalid JSON format from S3');
		}
		console.log('jsonData ', typeof jsonData);

		if (typeof jsonData !== 'object' || jsonData === null) {
			throw new Error('Parsed JSON is not a valid object');
		}

		// ✅ Build main invoice data
		const mainData = {
			voucher_type: 'P',
			uploaded_file_name: jsonData.OrginalDocumentName,
			organization_code: jsonData.OrganizationCode,
			vendor_code: jsonData.VCCode ?? null,
			company_name: jsonData.CustomerName ?? null,
			invoice_no: jsonData.InvoiceNumber ?? null,
			invoice_date: jsonData.InvoiceDate
				? new Date(jsonData.InvoiceDate)
				: null,
			ack_no: jsonData.InvoiceAcknowledgementNumber,
			ack_date: jsonData.InvoiceAcknowledgementDate
				? new Date(jsonData.InvoiceAcknowledgementDate)
				: null,
			due_date: jsonData.InvoiceDueDate
				? new Date(jsonData.InvoiceDueDate)
				: null,
			cgst: jsonData.InvoiceCGSTValue ?? null,
			sgst: jsonData.InvoiceSGSTValue ?? null,
			total_amount: jsonData.InvoiceTotal ?? null,
			seller_contact_no: jsonData.VendorPhoneNumber ?? null,
			seller_email_address: jsonData.VendorEmailAddress ?? null,
			seller_cin: jsonData.VendorCINNumber ?? null,
			seller_gstin: jsonData.VendorGSTNumber ?? null,
			seller_pan: jsonData.VendorPANNumber ?? null,
			account_holder_name: jsonData.VendorBankAccountHolderName ?? null,
			seller_bank_name: jsonData.VendorBankName ?? null,
			seller_account_no: jsonData.VendorBankAccountNumber ?? null,
			seller_ifsc_code: jsonData.VendorBankBranchIFSCCode ?? null,
			seller_address: jsonData.VendorAddress ?? null,
			seller_state: jsonData.VendorState ?? null,
			seller_district: jsonData.VendorDistrict ?? null,
			seller_pin_code: jsonData.VendorPinCode ?? null,
			// Customer Details
			place_of_supply: jsonData.CustomerBillToState ?? null,
			bill_to_ship_To: jsonData.CustomerName ?? null,
			buyer_email_address: jsonData.CustomerEmailAddress ?? null,
			buyer_gstin: jsonData.CustomerGSTNumber ?? null,
			buyer_contact_no: jsonData.CustomerPhoneNumber ?? null,
			billing_buyer_address: jsonData.CustomerBillToAddress ?? null,
			buyer_state: jsonData.CustomerBillToState ?? null,
			buyer_district: jsonData.CustomerBillToDistrict ?? null,
			buyer_pin_code: jsonData.CustomerBillToPinCode ?? null,
			status,
		};

		// ✅ Create main record
		const csvImport = await InvoiceCsvImport.create(mainData, {
			transaction: t,
		});
		console.log('csvImport ', csvImport.id);

		// ✅ Create line items safely using Promise.all
		if (
			csvImport?.id &&
			Array.isArray(jsonData.LineItems) &&
			jsonData.LineItems.length > 0
		) {
			await Promise.all(
				jsonData.LineItems.map((item) =>
					InvoiceCsvImportItem.create(
						{
							invoice_csv_import_id: csvImport.id,
							item_code: item.ItemCode ?? null,
							item_name: item.ItemName ?? null,
							description_of_item: item.ItemDescription ?? null,
							hsn_sac: item.ItemHsnCode ?? null,
							quantity: item.ItemQuantity ?? null,
							price_unit: item.ItemUnitPrice ?? null,
							sub_total: item.ItemSubTotal ?? null,
							item_discount_amount: item.ItemDiscountAmount ?? null,
							item_discount_percentage: item.ItemDiscountPercentage ?? null,
							item_net_price: item.ItemNetPrice ?? null,
							item_cgst_percentage: item.ItemCGSTPercentage ?? null,
							item_cgst_value: item.ItemCGSTValue ?? null,
							item_sgst_percentage: item.ItemSGSTPercentage ?? null,
							item_sgst_value: item.ItemSGSTValue ?? null,
							item_igst_percentage: item.ItemIGSTPercentage ?? null,
							item_igst_value: item.ItemIGSTValue ?? null,
							item_tax_percentage: item.ItemTaxPercentage ?? null,
							item_net_total: item.ItemNetTotal ?? null,
						},
						{ transaction: t }
					)
				)
			);
		}

		// ✅ Commit transaction
		await t.commit();
		console.log('✅ Transaction committed successfully');
	} catch (error) {
		// ✅ Rollback if anything fails
		if (!t.finished) {
			await t.rollback();
		}
		console.error('❌ Error in importDocumentCSV:', error.message);
	}
}

exports.getImportedInvoices = catchAsync(async (req, res) => {
	try {
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;

		const importedPurchasedInvoices = await InvoiceCsvImport.findAndCountAll({
			include: {
				model: InvoiceCsvImportItem,
				as: 'csv_items',
			},
			offset,
			limit,
		});
		console.log('importedPurchasedInvoices ', importedPurchasedInvoices);

		res.json({
			message: 'Imported purchased invoices successfully.',
			data: importedPurchasedInvoices.rows ?? [],
			count: importedPurchasedInvoices.count,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

exports.getSingleImportedInvoices = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;

		const importedPurchasedInvoice = await InvoiceCsvImport.findOne({
			where: { id },
			include: {
				model: InvoiceCsvImportItem,
				as: 'csv_items',
			},
		});

		res.json({
			message: 'Imported purchased invoice successfully.',
			data: importedPurchasedInvoice,
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});
