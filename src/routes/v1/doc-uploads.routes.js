const router = require('express').Router();
const DocumentsUploadsController = require('../../controllers/document-uploads.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const { upload } = require('../../middlewares/multer');
const verifyWebhookSignature = require('../../middlewares/verifyWebhookSignature');
const express = require('express');

router.post(
	'/webhook',
	verifyWebhookSignature,
	DocumentsUploadsController.updateDocumentStatus
);

router.use(verifyToken);

// router.get(
// 	'/counts',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	DocumentsUploadsController.getIssuesCounts
// );
router.post(
	'/',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	upload.single('attachment'),
	DocumentsUploadsController.uploadADocument
);

router.get(
	'/',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.getAllUploadedDocs
);
// router.put(
// 	'/:id',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	upload.single('attachment'),
// 	DocumentsUploadsController.updateIssue
// );
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.deleteUploadedDoc
);
router.get(
	'/getDocumentUrl/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.getDocumentSignedURL
);
router.get(
	'/sendDeleteRequest/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.sendDeleteRequestToAdmin
);

router.get(
	'/imported-purchase-invoices',
	checkRole(['Super Admin', 'Admin']),
	DocumentsUploadsController.getImportedInvoices
);

router.get('/imported-purchase-invoices/export', DocumentsUploadsController.exportProcessedPurchaseInvoices);
router.post('/imported-purchase-invoices/bulk-action', DocumentsUploadsController.generateVouchers);

router.get(
	'/imported-purchase-invoices/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.getSingleImportedInvoices
);

router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor', 'Vendor-Customer']),
	DocumentsUploadsController.getAUploadedDoc
);


// router.get(
// 	'/:id/history',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	DocumentsUploadsController.getIssueHistory
// );

// Status Counts

module.exports = router;
