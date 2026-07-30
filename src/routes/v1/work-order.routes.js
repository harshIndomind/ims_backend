const express = require('express');
const router = express.Router();
const workOrderController = require('../../controllers/work-order.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const { validationDispatchOrder, validationAcknowledgeOrder } = require('../../validations/OrderDispatch.validator');
const { upload: orderDocUpload } = require('../../middlewares/orderDocumentUpload');

router.use(verifyToken);

router.get('/generate-wo-number', workOrderController.generateWoNumber);
router.get('/export', checkPermission('work-order', 'export'), workOrderController.exportWorkOrders);
router.post('/', checkPermission('work-order', 'create'), workOrderController.createWorkOrder);
router.get('/', checkPermission('work-order', 'view'), workOrderController.getAllWorkOrders);

router.post('/:id/submit', checkPermission('work-order', 'edit'), workOrderController.submitWorkOrder);
router.post('/:id/approve', checkPermission('work-order', 'approve'), workOrderController.approveWorkOrder);
router.post('/:id/reject', checkPermission('work-order', 'reject'), workOrderController.rejectWorkOrder);
router.post('/:id/cancel', checkPermission('work-order', 'cancel'), workOrderController.cancelWorkOrder);
router.post('/:id/reopen', checkPermission('work-order', 'reopen'), workOrderController.reopenWorkOrder);
router.post('/:id/archive', checkPermission('work-order', 'archive'), workOrderController.archiveWorkOrder);
router.post('/:id/restore', checkPermission('work-order', 'archive'), workOrderController.restoreWorkOrder);
router.get('/:id/workflow', checkPermission('work-order', 'view'), workOrderController.getWorkOrderWorkflow);
router.post(
	'/:id/dispatch',
	checkPermission('work-order', 'dispatch'),
	validationDispatchOrder,
	validate,
	workOrderController.dispatchWorkOrder,
);
router.post(
	'/:id/acknowledge',
	checkPermission('work-order', 'acknowledge'),
	orderDocUpload.single('attachment'),
	validationAcknowledgeOrder,
	validate,
	workOrderController.acknowledgeWorkOrder,
);
router.get('/:id/dispatches', checkPermission('work-order', 'view'), workOrderController.listWorkOrderDispatches);
router.get(
	'/:id/acknowledgements',
	checkPermission('work-order', 'view'),
	workOrderController.listWorkOrderAcknowledgements,
);
router.post('/:id/html', checkPermission('work-order', 'view'), workOrderController.generateInvoiceHtml);
router.post('/:id/pdf', checkPermission('work-order', 'view'), workOrderController.downloadInvoicePdf);

router.get('/:id', checkPermission('work-order', 'view'), workOrderController.getWorkOrderById);
router.put('/:id', checkPermission('work-order', 'edit'), workOrderController.updateWorkOrder);
router.delete('/:id', checkPermission('work-order', 'delete'), workOrderController.deleteWorkOrder);

module.exports = router;
