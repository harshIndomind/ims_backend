const router = require('express').Router();
const paymentRequisitionController = require('../../controllers/payment-requisition.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get(
	'/generate-requisition-number',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.getNextRequisitionNo,
);

router.get(
	'/po-wo-summary',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.getPoWoSummary,
);

router.post(
	'/',
	checkPermission('payment-requisition', 'create'),
	paymentRequisitionController.createPaymentRequisition,
);

router.get(
	'/',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.getAllPaymentRequisitions,
);

router.get(
	'/:id',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.getPaymentRequisitionById,
);

router.put(
	'/:id',
	checkPermission('payment-requisition', 'edit'),
	paymentRequisitionController.updatePaymentRequisition,
);

router.delete(
	'/:id',
	checkPermission('payment-requisition', 'delete'),
	paymentRequisitionController.deletePaymentRequisition,
);

router.post(
	'/:id/html',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.generateRequisitionHtml,
);

router.post(
	'/:id/pdf',
	checkPermission('payment-requisition', 'view'),
	paymentRequisitionController.downloadRequisitionPdf,
);

module.exports = router;
