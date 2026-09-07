const express = require('express');
const router = express.Router();
const purchaseInvoiceController = require('../../controllers/purchase-invoice.controller');
const purchaseInvoiceDocumentController = require('../../controllers/purchaseInvoiceDocument.controller');
const { upload: purchaseInvoiceDocUpload } = require('../../middlewares/purchaseInvoiceDocumentUpload');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const {
	validationGetInvoiceableItems,
	validationCreatePurchaseInvoice,
	validationRejectOrCancel,
} = require('../../validations/PurchaseInvoice.validator');

router.use(verifyToken);

router.get('/generate-invoice-number', checkPermission('purchase-invoice', 'view'), purchaseInvoiceController.generateInvoiceNumber);

router.get(
	'/document/:document_type/:document_id/invoiceable-items',
	checkPermission('purchase-invoice', 'view'),
	validationGetInvoiceableItems,
	validate,
	purchaseInvoiceController.getInvoiceableItems,
);

// Ids to hide from the create form's PO/WO, QC, and MRN dropdowns — see
// getExhaustedLookupIds for what "exhausted" means.
router.get(
	'/document/:document_type/exhausted-ids',
	checkPermission('purchase-invoice', 'view'),
	purchaseInvoiceController.getExhaustedLookupIds,
);

router.post(
	'/',
	checkPermission('purchase-invoice', 'create'),
	validationCreatePurchaseInvoice,
	validate,
	purchaseInvoiceController.createPurchaseInvoice,
);
router.get('/', checkPermission('purchase-invoice', 'view'), purchaseInvoiceController.getAllPurchaseInvoices);

router.post('/:id/approve', checkPermission('purchase-invoice', 'approve'), purchaseInvoiceController.approvePurchaseInvoice);
router.post(
	'/:id/reject',
	checkPermission('purchase-invoice', 'reject'),
	validationRejectOrCancel,
	validate,
	purchaseInvoiceController.rejectPurchaseInvoice,
);
router.post(
	'/:id/cancel',
	checkPermission('purchase-invoice', 'cancel'),
	validationRejectOrCancel,
	validate,
	purchaseInvoiceController.cancelPurchaseInvoice,
);
router.get('/:id/workflow', checkPermission('purchase-invoice', 'view'), purchaseInvoiceController.getPurchaseInvoiceWorkflow);

// Vendor invoice document upload/list/delete — optional attachments kept for
// future reference only, no bearing on matching/workflow. Must sit before the
// bare /:id GET below.
router.post(
	'/:id/documents',
	checkPermission('purchase-invoice', 'create'),
	purchaseInvoiceDocUpload.array('documents', 10),
	purchaseInvoiceDocumentController.uploadDocuments,
);

router.get(
	'/:id/documents',
	checkPermission('purchase-invoice', 'view'),
	purchaseInvoiceDocumentController.getDocuments,
);

router.delete(
	'/:id/documents/:docId',
	checkPermission('purchase-invoice', 'create'),
	purchaseInvoiceDocumentController.deleteDocument,
);

router.get('/:id', checkPermission('purchase-invoice', 'view'), purchaseInvoiceController.getPurchaseInvoiceById);

module.exports = router;
