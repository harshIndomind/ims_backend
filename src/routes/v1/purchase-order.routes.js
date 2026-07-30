const express = require('express');
const router = express.Router();
const purchaseController = require('../../controllers/purchase-order.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const { validationDispatchOrder, validationAcknowledgeOrder } = require('../../validations/OrderDispatch.validator');
const { upload: orderDocUpload } = require('../../middlewares/orderDocumentUpload');

router.use(verifyToken);

router.get('/generate-po-number', purchaseController.generatePoNumber);
router.get('/export', checkPermission('purchase-order', 'export'), purchaseController.exportPurchaseOrders);
router.post('/', checkPermission('purchase-order', 'create'), purchaseController.createPurchaseOrder);
router.get('/', checkPermission('purchase-order', 'view'), purchaseController.getAllPurchaseOrders);

router.post('/:id/submit', checkPermission('purchase-order', 'edit'), purchaseController.submitPurchaseOrder);
router.post('/:id/approve', checkPermission('purchase-order', 'approve'), purchaseController.approvePurchaseOrder);
router.post('/:id/reject', checkPermission('purchase-order', 'reject'), purchaseController.rejectPurchaseOrder);
router.post('/:id/cancel', checkPermission('purchase-order', 'cancel'), purchaseController.cancelPurchaseOrder);
router.post('/:id/reopen', checkPermission('purchase-order', 'reopen'), purchaseController.reopenPurchaseOrder);
router.post('/:id/archive', checkPermission('purchase-order', 'archive'), purchaseController.archivePurchaseOrder);
router.post('/:id/restore', checkPermission('purchase-order', 'archive'), purchaseController.restorePurchaseOrder);
router.get('/:id/workflow', checkPermission('purchase-order', 'view'), purchaseController.getPurchaseOrderWorkflow);
router.post(
	'/:id/dispatch',
	checkPermission('purchase-order', 'dispatch'),
	validationDispatchOrder,
	validate,
	purchaseController.dispatchPurchaseOrder,
);
router.post(
	'/:id/acknowledge',
	checkPermission('purchase-order', 'acknowledge'),
	orderDocUpload.single('attachment'),
	validationAcknowledgeOrder,
	validate,
	purchaseController.acknowledgePurchaseOrder,
);
router.get('/:id/dispatches', checkPermission('purchase-order', 'view'), purchaseController.listPurchaseOrderDispatches);
router.get(
	'/:id/acknowledgements',
	checkPermission('purchase-order', 'view'),
	purchaseController.listPurchaseOrderAcknowledgements,
);
router.post('/:id/html', checkPermission('purchase-order', 'view'), purchaseController.generateInvoiceHtml);
router.post('/:id/pdf', checkPermission('purchase-order', 'view'), purchaseController.downloadInvoicePdf);

router.get('/:id', checkPermission('purchase-order', 'view'), purchaseController.getPurchaseOrderById);
router.put('/:id', checkPermission('purchase-order', 'edit'), purchaseController.updatePurchaseOrder);
router.delete('/:id', checkPermission('purchase-order', 'delete'), purchaseController.deletePurchaseOrder);

module.exports = router;
