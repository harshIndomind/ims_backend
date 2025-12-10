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
	MasterAccount,
	Narration,
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
const { Op, fn, col } = require('sequelize');
// const moment = require('moment-timezone');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { BASE_URL, PORTING_FILE } = require('../config/serverConfig');
const { format } = require('date-fns');
const moment = require('moment');

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

		const { role, id, org_id } = req.user;

		const businessPartner = await BusinessPartner.findOne({
			where: { user_id: id },
		});

		let columns = [];
		let wheres = {};

		if (['Vendor', 'Vendor-Customer', 'Customer'].includes(role)) {
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
					where: { organization_id: org_id },
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
		EDITED: '/results/',
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
		EDITED: 'edited',
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
			'EDITED',
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

		if (['RESULT', 'EDITED'].includes(status)) {
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
			company_name: jsonData.VendorName ?? null,
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
		const { org_id, roleId, role } = req.user;

		if (['Vendor', 'Customer', 'Vendor-Customer'].includes(role)) {
			throw new AppError(
				"Sorry! You don't have permission to access this resource"
			);
		}

		const vendor_id = parseInt(req.query.vendor_id) || null;
		const limit = parseInt(req.query.limit) || 10;
		const offset = parseInt(req.query.offset) || 0;
		const { from_date, to_date } = req.query;
		const fromDate = new Date(from_date);
		const toDate = new Date(to_date);
		console.log('org_id ', org_id);

		let whereClause = {};
		if (role === 'Admin') {
			const getOrganization = await organization.findByPk(org_id, {
				attributes: ['id', 'org_name', 'org_code'],
			});

			if (!getOrganization) {
				throw new AppError('Organization not found!');
			}

			const org_code = getOrganization.org_code;
			whereClause.organization_code = org_code;
		}

		if (role === 'Admin') {
			const getVendor = await BusinessPartner.findByPk(vendor_id, {
				attributes: [
					`id`,
					`organization_id`,
					`user_id`,
					`type`,
					`name`,
					`code`,
					`account_code`,
				],
			});

			if (getVendor) {
				console.log('getVendor ', getVendor);

				whereClause.vendor_code = getVendor.code;
			}
		}

		whereClause.createdAt = {
			[Op.between]: [fromDate, toDate],
		};

		console.log('whereClause ', whereClause);
		// Validate that both dates are valid
		if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
			throw new Error('Invalid date range');
		}

		// Adjust the end date to include the full day (23:59:59)
		toDate.setHours(23, 59, 59, 999);

		const importedPurchasedInvoices = await InvoiceCsvImport.findAndCountAll({
			where: whereClause,
			include: {
				model: InvoiceCsvImportItem,
				as: 'csv_items',
			},
			offset,
			limit,
			distinct: true,
			order: [['createdAt', 'DESC']],
		});

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

exports.exportProcessedPurchaseInvoices = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;
	const { selectedColumns, selectedItemColumns } = req.body;

	if (['Vendor', 'Customer', 'Vendor-Customer'].includes(role)) {
		throw new AppError(
			"Sorry! You don't have permission to access this resource"
		);
	}

	const { from_date, to_date } = req.query;
	const fromDate = new Date(from_date);
	const toDate = new Date(to_date);

	// Validate that both dates are valid
	if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
		throw new Error('Invalid date range');
	}

	// Adjust the end date to include the full day (23:59:59)
	toDate.setHours(23, 59, 59, 999);
	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	let whereClause = {};
	if (role === 'Admin') {
		const getOrganization = await organization.findByPk(org_id, {
			attributes: ['id', 'org_name', 'org_code'],
		});

		if (!getOrganization) {
			throw new AppError('Organization not found!');
		}

		const org_code = getOrganization.org_code;
		whereClause.organization_code = org_code;
	}

	whereClause.createdAt = {
		[Op.between]: [fromDate, toDate],
	};

	const invoices = await InvoiceCsvImport.findAll({
		where: whereClause,
		include: {
			model: InvoiceCsvImportItem,
			as: 'csv_items',
		},
		order: [['createdAt', 'DESC']],
	});

	let response = invoices.map((inv) => inv.get({ plain: true }));

	const workbook = new ExcelJS.Workbook();
	const templatePath = path.join(
		__dirname,
		'../templates/processed-purchase-invoices-template.xlsx'
	);
	const options = {
		dateFormats: ['DD/MM/YYYY'],
	};
	await workbook.xlsx.readFile(templatePath, options);

	const sheet = workbook.getWorksheet('Sheet1');
	let rowStart = 2;

	if (response) {
		response.forEach((inv, index) => {
			sheet.duplicateRow(rowStart, 1, true);

			const row = sheet.getRow(rowStart);
			const inputInvoiceDate = inv.invoice_date;
			const inputAckDate = inv.ack_date;
			const inputDueDate = inv.due_date;
			const momentInvoiceDate = moment(inputInvoiceDate, 'DD/MM/YYYY', true);
			const momentAckDate = moment(inputAckDate, 'DD/MM/YYYY', true);
			const momentDueDate = moment(inputDueDate, 'DD/MM/YYYY', true);
			if (!momentInvoiceDate.isValid()) {
				console.error('Invalid date format:', inputInvoiceDate);
				return;
			}
			if (!momentAckDate.isValid()) {
				console.error('Invalid date format:', inputAckDate);
				return;
			}
			if (!momentDueDate.isValid()) {
				console.error('Invalid date format:', inputDueDate);
				return;
			}
			const isoIvoiceDate = momentInvoiceDate.toDate();
			const isoAckDate = momentAckDate.toDate();
			const isoDueDate = momentDueDate.toDate();

			row.getCell(1).value = index + 1; // SR. NO.
			row.getCell(2).value = inv.voucher_type; // VOUCHER TYPE
			row.getCell(3).value = inv.uploaded_file_name; // UPLOADED FILENAME
			row.getCell(4).value = inv.organization_code; // ORGANIZATION CODE
			row.getCell(5).value = inv.vendor_code; // VENDOR CODE
			row.getCell(6).value = inv.company_name; // COMPANY NAME
			row.getCell(7).value = inv.invoice_no; // INVOICE NO
			row.getCell(8).value = format(isoIvoiceDate, 'dd-MM-yyyy'); // INVOICE DATE
			row.getCell(9).value = inv.ack_no; // ACK NO
			row.getCell(10).value = format(isoAckDate, 'dd-MM-yyyy'); // ACK DATE
			row.getCell(11).value = format(isoDueDate, 'dd-MM-yyyy'); // DUE DATE
			row.getCell(12).value = inv.cgst; // CGST
			row.getCell(13).value = inv.sgst; // SGST
			row.getCell(14).value = inv.total_amount; // TOTAL AMOUNT
			row.getCell(15).value = inv.seller_contact_no; // SELLER CONTACT NO
			row.getCell(16).value = inv.seller_email_address; // SELLER EMAIL ADDRESS
			row.getCell(17).value = inv.seller_cin; // SELLER CIN
			row.getCell(18).value = inv.seller_gstin; // SELLER GSTIN
			row.getCell(19).value = inv.seller_pan; // SELLER PAN
			row.getCell(20).value = inv.account_holder_name; // ACCOUNT HOLDER NAME
			row.getCell(21).value = inv.seller_bank_name; // SELLER BANK NAME
			row.getCell(22).value = inv.seller_account_no; // SELLER ACCOUNT NO
			row.getCell(23).value = inv.seller_ifsc_code; // SELLER IFSC CODE
			row.getCell(24).value = inv.seller_address; // SELLER ADDRESS
			row.getCell(25).value = inv.seller_state; // SELLER STATE
			row.getCell(26).value = inv.seller_district; // SELLER DISTRICT
			row.getCell(27).value = inv.seller_pin_code; // SELLER PIN CODE
			row.getCell(28).value = inv.place_of_supply; // PLACE OF SUPPLY
			row.getCell(29).value = inv.bill_to_ship_to; // BILL TO SHIP TO
			row.getCell(30).value = inv.buyer_email_address; // BUYER EMAIL ADDRESS
			row.getCell(31).value = inv.buyer_gstin; // BUYER GSTIN
			row.getCell(32).value = inv.buyer_contact_no; // BUYER CONTACT NO
			row.getCell(33).value = inv.billing_buyer_address; // BILLING BUYER ADDRESS
			row.getCell(34).value = inv.buyer_state; // BUYER STATE
			row.getCell(35).value = inv.buyer_district; // BUYER DISTRICT
			row.getCell(36).value = inv.buyer_pin_code; // BUYER PIN CODE
			row.getCell(37).value = inv.createdAt; // CREATEDAT
			row.getCell(38).value = inv.status; // STATUS
			row.getCell(39).value = inv.porting_status; // PORTING STATUS

			row.commit();

			// Insert first item in same row
			if (inv.csv_items && inv.csv_items.length > 0) {
				const first = inv.csv_items[0];
				row.getCell(41).value = first.item_code;
				row.getCell(42).value = first.item_name;
				row.getCell(43).value = first.description_of_item;
				row.getCell(44).value = first.hsn_sac;
				row.getCell(45).value = first.quantity;
				row.getCell(46).value = first.price_unit;
				row.getCell(47).value = first.sub_total;
				row.getCell(48).value = first.item_discount_amount;
				row.getCell(49).value = first.item_discount_percentage;
				row.getCell(50).value = first.item_net_price;
				row.getCell(51).value = first.item_cgst_percentage;
				row.getCell(52).value = first.item_cgst_value;
				row.getCell(53).value = first.item_sgst_percentage;
				row.getCell(54).value = first.item_sgst_value;
				row.getCell(55).value = first.item_igst_percentage;
				row.getCell(56).value = first.item_igst_value;
				row.getCell(57).value = first.item_tax_percentage;
				row.getCell(58).value = first.item_net_total;

				row.commit();
			}

			// For all remaining items, add NEW rows but leave invoice columns empty
			for (let i = 1; i < inv.csv_items.length; i++) {
				const item = inv.csv_items[i];
				rowStart++; // move to next row
				const itemRow = sheet.getRow(rowStart);

				const startCol = 1; // Column A
				const endCol = 58; // Column BF
				const bgColor = i % 2 === 0 ? 'FFFFE0' : 'E6F7FF';
				for (let col = startCol; col <= endCol; col++) {
					itemRow.getCell(col).fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: bgColor }, // light cream color
					};
				}
				// Invoice fields remain EMPTY
				// Only fill item columns:
				itemRow.getCell(41).value = item.item_code;
				itemRow.getCell(42).value = item.item_name;
				itemRow.getCell(43).value = item.description_of_item;
				itemRow.getCell(44).value = item.hsn_sac;
				itemRow.getCell(45).value = item.quantity;
				itemRow.getCell(46).value = item.price_unit;
				itemRow.getCell(47).value = item.sub_total;
				itemRow.getCell(48).value = item.item_discount_amount;
				itemRow.getCell(49).value = item.item_discount_percentage;
				itemRow.getCell(50).value = item.item_net_price;
				itemRow.getCell(51).value = item.item_cgst_percentage;
				itemRow.getCell(52).value = item.item_cgst_value;
				itemRow.getCell(53).value = item.item_sgst_percentage;
				itemRow.getCell(54).value = item.item_sgst_value;
				itemRow.getCell(55).value = item.item_igst_percentage;
				itemRow.getCell(56).value = item.item_igst_value;
				itemRow.getCell(57).value = item.item_tax_percentage;
				itemRow.getCell(58).value = item.item_net_total;

				itemRow.commit();
			}
			rowStart++;
		});

		sheet.spliceRows(rowStart, 2);

		sheet.columns.forEach((column) => {
			let maxLength = 0;

			column.eachCell({ includeEmpty: true }, (cell) => {
				cell.alignment = { vertical: 'middle', horizontal: 'left' };
				let columnLength = 10; // minimum width
				if (cell.value) {
					if (cell.type === ExcelJS.ValueType.Date) {
						// Show how Excel will display it
						columnLength = 19; // "dd/mm/yyyy hh:mm:ss" is 19 chars
					} else {
						columnLength = cell.value.toString().length;
					}
				}
				if (columnLength > maxLength) {
					maxLength = columnLength;
				}
			});
			column.width = Math.min(maxLength + 2, 25);
		});
	}

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

	const fileName = formatted + '_processed_purchased_invoices.xlsx';

	res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	);

	await workbook.xlsx.write(res);

	res.end();
});

exports.generateVouchersV1 = catchAsync(async (req, res) => {
	const { ids } = req.body;

	// Validate
	if (!Array.isArray(ids) || ids.length === 0) {
		return res.status(400).json({ message: 'Ids are required for porting.' });
	}

	const templatePath = path.join(__dirname, `../templates/${PORTING_FILE}`);
	console.log('templatePath ', templatePath);

	setTimeout(async () => {
		try {
			await InvoiceCsvImport.update(
				{ porting_status: 1 },
				{ where: { id: { [Op.in]: ids } } }
			);

			return res.download(
				templatePath,
				'Voucher-Porting-Template.xlsx',
				(err) => {
					if (err) {
						console.error(err);
						return res.status(500).json({ message: 'Failed to download file' });
					}
				}
			);
			// return res.json({ message: 'Purchase invoices ported successfully' });
		} catch (err) {
			console.error(err);
			return res.status(500).json({ message: 'Internal server error' });
		}
	}, 2000);
});

function normalize(str) {
	return str
		.trim() // remove leading/trailing spaces
		.replace(/\s+/g, ' ') // collapse multiple spaces
		.replace(/[^a-zA-Z0-9 ]/g, '') // remove special characters
		.toLowerCase();
}

exports.generateVouchers = catchAsync(async (req, res) => {
	const { ids } = req.body;
	const { org_id, role } = req.user;

	if (['Vendor', 'Customer', 'Vendor-Customer'].includes(role)) {
		throw new AppError(
			"Sorry! You don't have permission to access this resource"
		);
	}

	if (!Array.isArray(ids) || ids.length === 0) {
		return res.status(400).json({ message: 'Ids are required for porting.' });
	}

	let whereClause = {};
	if (role === 'Admin') {
		const getOrganization = await organization.findByPk(org_id, {
			attributes: ['id', 'org_name', 'org_code'],
		});

		if (!getOrganization) {
			throw new AppError('Organization not found!');
		}

		const org_code = getOrganization.org_code;
		whereClause.organization_code = org_code;
	}

	whereClause.id = { [Op.in]: ids };
	whereClause.porting_status = 0;

	const purchaseInvoices = await InvoiceCsvImport.findAll({
		where: whereClause,
		include: {
			model: InvoiceCsvImportItem,
			as: 'csv_items',
		},
		order: [['createdAt', 'DESC']],
	});

	const invoices = purchaseInvoices.map((inv) => inv.get({ plain: true }));
	// console.log('purchaseInvoices ', invoices);

	const masterAccounts = await MasterAccount.findAll({
		where: {
			A_NAME: {
				[Op.in]: [
					'GST INPUT',
					'CGST INPUT',
					'SGST INPUT',
					'TDS Payable',
					'OFFICE RENT AND EXP.',
				],
			},
		},
		attributes: ['A_CODE', 'UNIV_CODE', 'A_NAME', 'A_LEDGER'],
	});

	const masterAccountMap = masterAccounts.map((mc) => mc.get({ plain: true }));
	// console.log('masterAccounts ', masterAccounts);

	const generatedVouchers = [];
	for (let [i, invoice] of invoices.entries()) {
		console.log(i, invoice);

		const totals = invoice.csv_items.reduce(
			(acc, item) => {
				acc.amountBeforeTax += parseFloat(item.price_unit) || 0;
				acc.totalIgstAmount += parseFloat(item.item_igst_value) || 0;
				acc.totalCgstAmount += parseFloat(item.item_cgst_value) || 0;
				acc.totalSgstAmount += parseFloat(item.item_sgst_value) || 0;
				return acc;
			},
			{
				amountBeforeTax: 0,
				totalIgstAmount: 0,
				totalCgstAmount: 0,
				totalSgstAmount: 0,
			}
		);

		const totalTaxAmount =
			totals.amountBeforeTax +
			(totals.totalIgstAmount +
				totals.totalCgstAmount +
				totals.totalSgstAmount);

		const companyDetails = await BusinessPartner.findOne({
			where: { name: normalize(invoice.company_name) },
		});
		console.log('companyDetails ', companyDetails);

		if (!companyDetails) {
			continue;
		}

		const narrationText = await getVoucherNarration('STO1009');

		if (!narrationText) {
			continue;
		}

		// DEDUCTED_COMPANY_NAME_INVOICE_MONTH_YEAR, FROM_COMPANY_NAME, INVOICE_NO, INVOICE_DATE
		narration = narrationText
			.replace(
				'DEDUCTED_COMPANY_NAME_INVOICE_MONTH_YEAR',
				`OFFICE PARKING RENT ADVANCE FOR THE MONTH OF ${getMonthYear(
					invoice.invoice_date
				).toUpperCase()}`
			)
			.replace('FROM_COMPANY_NAME', normalize(invoice.company_name))
			.replace('INVOICE_NO', invoice.invoice_no)
			.replace('INVOICE_DATE', getDate(invoice.invoice_date));

		for (let account of masterAccounts) {
			if (account.A_NAME === 'OFFICE RENT AND EXP.') {
				generatedVouchers.push({
					sr_no: i + 1,
					voucher_type_code: 'P',
					voucher_date: getDate(new Date(), true),
					account_code: account.A_CODE,
					universal_code: account.UNIV_CODE,
					payment_option: 'NA',
					transaction_type_code: 40,
					narration_code: 'STO1009',
					narration_text: narration,
					profit_loss_code: 'NE',
					balance_sheet_code: 'NE',
					cash_flow_code: 'NE',
					ledger_code: account.A_LEDGER,
					book: 'P',
					debit_amount: totals.amountBeforeTax,
					credit_amount: 0,
					debit_total_amount: totalTaxAmount,
					credit_total_amount: totalTaxAmount,
					varr1_ref: 'INVOICE',
					varr2_number: invoice.invoice_no || '',
					varr3: 'NA',
					varr4_date: getDate(new Date(), true),
					varr5: 'NA',
					cc_code: '0',
					mis_code: 'NE',
					doc_url: 'URL',
				});
			}
			if (account.A_NAME === 'GST INPUT' && totals.totalIgstAmount > 0) {
				generatedVouchers.push({
					sr_no: i + 1,
					voucher_type_code: 'P',
					voucher_date: getDate(new Date(), true),
					account_code: account.A_CODE,
					universal_code: account.UNIV_CODE,
					payment_option: 'NA',
					transaction_type_code: 40,
					narration_code: 'STO1009',
					narration_text: narration,
					profit_loss_code: 'NE',
					balance_sheet_code: 'NE',
					cash_flow_code: 'NE',
					ledger_code: account.A_LEDGER,
					book: 'P',
					debit_amount: totals.totalIgstAmount,
					credit_amount: 0,
					debit_total_amount: totalTaxAmount,
					credit_total_amount: totalTaxAmount,
					varr1_ref: 'INVOICE',
					varr2_number: invoice.invoice_no || '',
					varr3: 'NA',
					varr4_date: getDate(new Date(), true),
					varr5: 'NA',
					cc_code: '0',
					mis_code: 'NE',
					doc_url: 'URL',
				});
			}
			if (account.A_NAME === 'CGST INPUT' && totals.totalCgstAmount > 0) {
				generatedVouchers.push({
					sr_no: i + 1,
					voucher_type_code: 'P',
					voucher_date: getDate(new Date(), true),
					account_code: account.A_CODE,
					universal_code: account.UNIV_CODE,
					payment_option: 'NA',
					transaction_type_code: 40,
					narration_code: 'STO1009',
					narration_text: narration,
					profit_loss_code: 'NE',
					balance_sheet_code: 'NE',
					cash_flow_code: 'NE',
					ledger_code: account.A_LEDGER,
					book: 'P',
					debit_amount: totals.totalCgstAmount,
					credit_amount: 0,
					debit_total_amount: totalTaxAmount,
					credit_total_amount: totalTaxAmount,
					varr1_ref: 'INVOICE',
					varr2_number: invoice.invoice_no || '',
					varr3: 'NA',
					varr4_date: getDate(new Date(), true),
					varr5: 'NA',
					cc_code: '0',
					mis_code: 'NE',
					doc_url: 'URL',
				});
			}
			if (account.A_NAME === 'SGST INPUT' && totals.totalSgstAmount > 0) {
				generatedVouchers.push({
					sr_no: i + 1,
					voucher_type_code: 'P',
					voucher_date: getDate(new Date(), true),
					account_code: account.A_CODE,
					universal_code: account.UNIV_CODE,
					payment_option: 'NA',
					transaction_type_code: 40,
					narration_code: 'STO1009',
					narration_text: narration,
					profit_loss_code: 'NE',
					balance_sheet_code: 'NE',
					cash_flow_code: 'NE',
					ledger_code: account.A_LEDGER,
					book: 'P',
					debit_amount: totals.totalSgstAmount,
					credit_amount: 0,
					debit_total_amount: totalTaxAmount,
					credit_total_amount: totalTaxAmount,
					varr1_ref: 'INVOICE',
					varr2_number: invoice.invoice_no || '',
					varr3: 'NA',
					varr4_date: getDate(new Date(), true),
					varr5: 'NA',
					cc_code: '0',
					mis_code: 'NE',
					doc_url: 'URL',
				});
			}

			if (
				account.A_NAME === 'TDS Payable' &&
				companyDetails.isApplicableForTds &&
				Number(companyDetails.tds_percentage) > 0
			) {
				generatedVouchers.push({
					sr_no: i + 1,
					voucher_type_code: 'P',
					voucher_date: getDate(new Date(), true),
					account_code: account.A_CODE,
					universal_code: account.UNIV_CODE,
					payment_option: 'NA',
					transaction_type_code: 40,
					narration_code: 'STO1009',
					narration_text: narration,
					profit_loss_code: 'NE',
					balance_sheet_code: 'NE',
					cash_flow_code: 'NE',
					ledger_code: account.A_LEDGER,
					book: 'P',
					debit_amount: 0,
					credit_amount:
						(totals.amountBeforeTax * companyDetails.tds_percentage) / 100,
					debit_total_amount: totalTaxAmount,
					credit_total_amount: totalTaxAmount,
					varr1_ref: 'INVOICE',
					varr2_number: invoice.invoice_no || '',
					varr3: 'NA',
					varr4_date: getDate(new Date(), true),
					varr5: 'NA',
					cc_code: '0',
					mis_code: 'NE',
					doc_url: 'URL',
				});
			}
		}
		generatedVouchers.push({
			sr_no: i + 1,
			voucher_type_code: 'P',
			voucher_date: getDate(new Date(), true),
			account_code: companyDetails.account_code,
			universal_code: companyDetails.account_code,
			payment_option: 'NA',
			transaction_type_code: 40,
			narration_code: 'STO1009',
			narration_text: narration,
			profit_loss_code: 'NE',
			balance_sheet_code: 'NE',
			cash_flow_code: 'NE',
			ledger_code: 'K',
			book: 'P',
			debit_amount: 0,
			credit_amount: totalTaxAmount,
			debit_total_amount: totalTaxAmount,
			credit_total_amount: totalTaxAmount,
			varr1_ref: 'INVOICE',
			varr2_number: invoice.invoice_no || '',
			varr3: 'NA',
			varr4_date: getDate(new Date(), true),
			varr5: 'NA',
			cc_code: '0',
			mis_code: 'NE',
			doc_url: 'URL',
		});
	}
	console.log('Generated Vouchers => ', generatedVouchers);

	return;
	const templatePath = path.join(__dirname, `../templates/${PORTING_FILE}`);
	console.log('templatePath ', templatePath);

	setTimeout(async () => {
		try {
			await InvoiceCsvImport.update(
				{ porting_status: 1 },
				{ where: { id: { [Op.in]: ids } } }
			);

			return res.download(
				templatePath,
				'Voucher-Porting-Template.xlsx',
				(err) => {
					if (err) {
						console.error(err);
						return res.status(500).json({ message: 'Failed to download file' });
					}
				}
			);
			// return res.json({ message: 'Purchase invoices ported successfully' });
		} catch (err) {
			console.error(err);
			return res.status(500).json({ message: 'Internal server error' });
		}
	}, 2000);
});

function voucherObject(data) {
	return {
		SR_NO: '',
		VOUCHER_TYPE_CODE: '',
		VOUCHER_DATE: '',
		ACCOUNT_CODE: '',
		UNIVERSAL_CODE: '',
		PAYMENT_OPTION: '',
		TRANSACTION_TYPE_CODE: '',
		NARRATION_CODE: '',
		NARRATION_TEXT: '',
		PROFIT_LOSS_CODE: '',
		BALANCE_SHEET_CODE: '',
		CASH_FLOW_CODE: '',
		LEDGER_CODE: '',
		BOOK: '',
		DEBIT_AMOUNT: '',
		CREDIT_AMOUNT: '',
		DEBIT_TOTAL_AMOUNT: '',
		CREDIT_TOTAL_AMOUNT: '',
		VARR1_REF: '',
		VARR2_NUMBER: '',
		VARR3: '',
		VARR4_DATE: '',
		VARR5: '',
		CC_CODE: '',
		MIS_CODE: '',
		DOC_URL: '',
	};
}

async function getVoucherNarration(narration_code = null) {
	if (!narration_code) {
		return null;
		throw new AppError(`Narrtion code is required.`);
	}

	const narration = await Narration.findOne({
		where: {
			NARR_CODE: narration_code,
		},
	});

	if (!narration) {
		return null;
		throw new AppError(`Narrtion not found for code: ${narration_code}`);
	}

	// [VALUES] SHOULD BE DYNAMIC
	// AMOUNT PROVIDED FOR [OFFICE PARKING RENT ADVANCE FOR THE MONTH OF NOVEMBER 2025] FROM [OFIS SPACES PRIVATE LIMITED] AGST. BILL/GR/CHALLAN NO. [OSN2/25-26/01177 DATED 01-11-2025]
	const narrationText = `${narration.VARR1} ${narration.VARR2} DEDUCTED_COMPANY_NAME_INVOICE_MONTH_YEAR ${narration.VARR4} FROM_COMPANY_NAME ${narration.VARR6} INVOICE_NO ${narration.VARR8} INVOICE_DATE`;
	return narrationText;
}

function getDate(date = null, includeTime = false) {
	const newDate = date ? new Date(date) : new Date();

	if (isNaN(newDate)) return null; // handle invalid date

	const yyyy = newDate.getFullYear();
	const mm = String(newDate.getMonth() + 1).padStart(2, '0');
	const dd = String(newDate.getDate()).padStart(2, '0');

	const modifiedDate = `${yyyy}-${mm}-${dd}`;

	if (!includeTime) return modifiedDate;

	const hh = String(newDate.getHours()).padStart(2, '0');
	const min = String(newDate.getMinutes()).padStart(2, '0');
	const ss = String(newDate.getSeconds()).padStart(2, '0');

	return `${modifiedDate} ${hh}:${min}:${ss}`;
}

function getMonthYear(date = null) {
	const newDate = new Date(date);
	const monthNames = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December',
	];

	return `${monthNames[newDate.getMonth()]} ${newDate.getFullYear()}`;
}

const INVOICE_FIELDS = {
	sr_no: 'SR NO',
	voucher_type: 'Voucher Type',
	uploaded_filename: 'Uploaded Filename',
	organization_code: 'Organization Code',
	vendor_code: 'Vendor Code',
	company_name: 'Company Name',
	invoice_no: 'Invoice No',
	invoice_date: 'Invoice Date',
	ack_no: 'Ack No',
	ack_date: 'Ack Date',
	due_date: 'Due Date',
	cgst: 'CGST',
	sgst: 'SGST',
	total_amount: 'Total Amount',
	seller_contact_no: 'Seller Contact No',
	seller_email_address: 'Seller Email',
	seller_cin: 'Seller CIN',
	seller_gstin: 'Seller GSTIN',
	seller_pan: 'Seller PAN',
	account_holder_name: 'Account Holder Name',
	seller_bank_name: 'Seller Bank Name',
	seller_account_no: 'Seller Account No',
	seller_ifsc_code: 'Seller IFSC Code',
	seller_address: 'Seller Address',
	seller_state: 'Seller State',
	seller_district: 'Seller District',
	seller_pin_code: 'Seller PIN Code',
	place_of_supply: 'Place of Supply',
	bill_to_ship_To: 'Bill To / Ship To',
	buyer_email_address: 'Buyer Email',
	buyer_gstin: 'Buyer GSTIN',
	buyer_contact_no: 'Buyer Contact No',
	billing_buyer_address: 'Billing Buyer Address',
	buyer_state: 'Buyer State',
	buyer_district: 'Buyer District',
	buyer_pin_code: 'Buyer Pin Code',
	created_at: 'Created At',
	status: 'Status',
	porting_status: 'Porting Status',
};

const ITEM_FIELDS = {
	item_code: 'Item Code',
	item_name: 'Item Name',
	description_of_item: 'Description',
	hsn_sac: 'HSN/SAC',
	quantity: 'Quantity',
	price_unit: 'Unit Price',
	sub_total: 'Sub Total',
	item_discount_amount: 'Discount Amount',
	item_discount_percentage: 'Discount %',
	item_net_price: 'Net Price',
	item_cgst_percentage: 'CGST %',
	item_cgst_value: 'CGST Value',
	item_sgst_percentage: 'SGST %',
	item_sgst_value: 'SGST Value',
	item_igst_percentage: 'IGST %',
	item_igst_value: 'IGST Value',
	item_tax_percentage: 'Tax %',
	item_net_total: 'Item Net Total',
};

exports.exportProcessedPurchaseInvoicesV1 = catchAsync(async (req, res) => {
	const { org_id, role } = req.user;
	const { selectedColumns, selectedItemColumns } = req.body;

	// Permission check
	if (['Vendor', 'Customer', 'Vendor-Customer'].includes(role)) {
		throw new AppError(
			"Sorry! You don't have permission to access this resource"
		);
	}

	const { from_date, to_date, vendor_id } = req.query;
	const fromDate = new Date(from_date);
	const toDate = new Date(to_date);

	if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
		throw new Error('Invalid date range');
	}

	toDate.setHours(23, 59, 59, 999);

	if (!org_id && role !== 'Admin') {
		throw new AppError(`You don't authorize to access this api.`);
	}

	// Build where clause
	let whereClause = {};
	let organizationName = 'All';
	let businessPartnerName = null;
	if (role === 'Admin') {
		const getOrganization = await organization.findByPk(org_id, {
			attributes: ['id', 'org_name', 'org_code'],
		});

		if (!getOrganization) throw new AppError('Organization not found!');
		organizationName = getOrganization.org_name;
		whereClause.organization_code = getOrganization.org_code;

		const getVendor = await BusinessPartner.findByPk(vendor_id, {
			attributes: [
				`id`,
				`organization_id`,
				`user_id`,
				`type`,
				`name`,
				`code`,
				`account_code`,
			],
		});

		if (getVendor) {
			businessPartnerName = getVendor.name;
			console.log("businessPartnerName ", businessPartnerName);
			
			whereClause.vendor_code = getVendor.code;
		}
	}

	whereClause.createdAt = { [Op.between]: [fromDate, toDate] };

	// Fetch invoices
	const invoices = await InvoiceCsvImport.findAll({
		where: whereClause,
		include: {
			model: InvoiceCsvImportItem,
			as: 'csv_items',
		},
		order: [['createdAt', 'DESC']],
	});

	const response = invoices.map((inv) => inv.get({ plain: true }));
	console.log('response ', response);

	// Auto-include all invoice columns if none selected
	const finalInvoiceColumns =
		selectedColumns && selectedColumns.length > 0
			? selectedColumns
			: Object.keys(INVOICE_FIELDS);

	// Auto-include all item columns if none selected
	const finalItemColumns =
		selectedItemColumns && selectedItemColumns.length > 0
			? selectedItemColumns
			: Object.keys(ITEM_FIELDS);

	// Build dynamic headers
	const headers = [
		...finalInvoiceColumns.map((c) => INVOICE_FIELDS[c]),
		...finalItemColumns.map((c) => ITEM_FIELDS[c]),
	];
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Purchased Invoices');

	// Calculate how many columns we need to merge
	// const totalColumns = selectedColumns.length + selectedItemColumns.length;

	// Generate title text lines
	const line2 = `(From ${moment(fromDate).format('DD-MM-YYYY')} To ${moment(
		toDate
	).format('DD-MM-YYYY')})`;
	const line1 = `Purchase Register ${line2}`;
	const line3 = `Organization: ${organizationName || ''} ${(businessPartnerName) ? ` Vendor/Customer:  ${businessPartnerName}` : ''}`; // optional, can change

	// Insert 3 rows at top
	sheet.insertRow(1, [line1]);
	// sheet.insertRow(2, [line2]);
	sheet.insertRow(3, [line3]);

	// Add header row
	const insertedRow = sheet.addRow(headers);
	insertedRow.eachCell((cell) => {
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'D9D9D9' }, // Light gray
		};
		cell.alignment = { horizontal: 'left', vertical: 'middle' };
	});
	const totalColumns = sheet.actualColumnCount;
	// Merge each title row across all columns
	sheet.mergeCells(1, 1, 2, totalColumns);
	sheet.mergeCells(3, 1, 3, totalColumns);

	// Style all three title rows
	[sheet.getRow(1), sheet.getRow(2), sheet.getRow(3)].forEach((row) => {
		row.font = { bold: true, size: 14 };
		row.alignment = { horizontal: 'center', vertical: 'middle' };
	});
	const headerRow = sheet.getRow(4);
	headerRow.font = { bold: true };
	headerRow.alignment = { horizontal: 'left', vertical: 'middle' };

	sheet.views = [
		{
			state: 'frozen',
			ySplit: 4, // freeze top 4 rows
		},
	];

	// ------------------ BEFORE LOOP -------------------
	const totals = {};
	finalInvoiceColumns.forEach((col) => {
		totals[col] = 0; // Initialize totals
	});
	finalItemColumns.forEach((col) => {
		totals[col] = 0; // Initialize totals
	});

	//-----------------------------------------------
	// Insert data rows
	//-----------------------------------------------
	response.forEach((inv, index) => {
		const firstItem = inv.csv_items[0] || {};

		const rowData = [];

		// Invoice columns
		finalInvoiceColumns.forEach((col) => {
			if (col === 'sr_no') {
				rowData.push(index + 1);
			} else if (
				['invoice_date', 'ack_date', 'due_date', 'created_at'].includes(col)
			) {
				const d = inv[col];
				rowData.push(d ? moment(d).format('DD-MM-YYYY') : '');
			} else {
				let val = inv[col] ?? '';
				if (['cgst', 'sgst', 'total_amount'].includes(col)) {
					val = parseFloat(val || 0);
				}
				rowData.push(val);

				// Only accumulate if it's a number
				if (!isNaN(val) && ['cgst', 'sgst', 'total_amount'].includes(col)) {
					totals[col] += parseFloat(val);
				}
			}
		});

		// First item columns
		finalItemColumns.forEach((col) => {
			let val = firstItem[col];
			if (
				[
					'quantity',
					'price_unit',
					'sub_total',
					'item_discount_amount',
					'item_net_price',
					'item_cgst_value',
					'item_sgst_value',
					'item_igst_value',
					'item_net_total',
				].includes(col)
			) {
				val = parseFloat(val || 0);
			}

			rowData.push(val ?? '');
			if (
				!isNaN(parseFloat(val)) &&
				[
					'quantity',
					'price_unit',
					'sub_total',
					'item_discount_amount',
					'item_net_price',
					'item_cgst_value',
					'item_sgst_value',
					'item_igst_value',
					'item_net_total',
				].includes(col)
			) {
				totals[col] += parseFloat(val);
			}
		});

		const insertedRow = sheet.addRow(rowData);
		insertedRow.eachCell((cell) => {
			cell.alignment = { horizontal: 'left', vertical: 'middle' };
		});
		// Additional items
		for (let i = 1; i < inv.csv_items.length; i++) {
			const item = inv.csv_items[i];

			const emptyInvoiceCols = new Array(finalInvoiceColumns.length).fill('');

			const itemRow = [
				...emptyInvoiceCols,
				...finalItemColumns.map((col) => item[col] ?? ''),
			];

			const insertedRow = sheet.addRow(itemRow);
			insertedRow.eachCell((cell) => {
				cell.alignment = { horizontal: 'left', vertical: 'middle' };
			});
			finalItemColumns.forEach((col) => {
				if (
					!isNaN(parseFloat(item[col])) &&
					[
						'quantity',
						'price_unit',
						'sub_total',
						'item_discount_amount',
						'item_net_price',
						'item_cgst_value',
						'item_sgst_value',
						'item_igst_value',
						'item_net_total',
					].includes(col)
				) {
					totals[col] += parseFloat(item[col]);
				}
			});
		}
	});

	const lastRowIndex = sheet.rowCount + 1;
	const totalRow = [];
	console.log('totals ', totals);

	finalInvoiceColumns.forEach((col) => {
		if (typeof totals[col] === 'number' && totals[col] > 0) {
			totalRow.push(totals[col].toFixed(2));
		} else {
			totalRow.push(''); // empty cell
		}
	});

	finalItemColumns.forEach((col) => {
		if (typeof totals[col] === 'number' && totals[col] > 0) {
			totalRow.push(totals[col].toFixed(2));
		} else {
			totalRow.push(''); // empty cell
		}
	});

	// For item columns → keep empty
	finalItemColumns.forEach(() => totalRow.push(''));

	const footerInsertedRow = sheet.addRow(totalRow);
	footerInsertedRow.eachCell((cell) => {
		cell.alignment = { horizontal: 'left', vertical: 'middle' };
	});
	const totalExcelRow = sheet.getRow(sheet.rowCount);
	for (let col = 1; col <= totalColumns; col++) {
		const cell = totalExcelRow.getCell(col);

		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'D9D9D9' }, // Light gray
		};
		cell.font = { bold: true };
		cell.alignment = { horizontal: 'center', vertical: 'middle' };
	}

	//-----------------------------------------------
	// Auto column width
	//-----------------------------------------------

	for (let col = 1; col <= totalColumns; col++) {
		const column = sheet.getColumn(col);

		let maxLength = 10;

		column.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
			let v = cell.value ? cell.value.toString() : '';
			if (v.length > 60) v = v.substring(0, 60);
			maxLength = Math.max(maxLength, v.length);
		});

		// Detect if numeric column
		const isNumeric = column.values.some((v) => typeof v === 'number');

		column.width = isNumeric
			? Math.min(maxLength + 2, 14)
			: Math.min(maxLength + 2, 28);
	}

	//-----------------------------------------------
	// File Export
	//-----------------------------------------------
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

	const fileName = `${formatted}_processed_purchased_invoices.xlsx`;

	res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	);

	await workbook.xlsx.write(res);
	res.end();
});
