const express = require('express');
const router = express.Router();
const qcInspectionController = require('../../controllers/qc-inspection.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateInspection,
	validationAssignInspector,
	validationSaveItems,
	validationRejectOrCancel,
	validationGetRemaining,
} = require('../../validations/QcInspection.validator');
const { upload: orderDocUpload } = require('../../middlewares/orderDocumentUpload');

router.use(verifyToken);

router.get('/generate-qc-number', checkPermission('quality-control', 'view'), qcInspectionController.generateQcNumber);
router.post('/', checkPermission('quality-control', 'create'), validationCreateInspection, validate, qcInspectionController.createInspection);
router.get('/', checkPermission('quality-control', 'view'), qcInspectionController.getAllInspections);
router.get(
	'/document/:document_type/:document_id/remaining',
	checkPermission('quality-control', 'view'),
	validationGetRemaining,
	validate,
	qcInspectionController.getRemainingForDocument,
);

router.post(
	'/:id/assign',
	checkPermission('quality-control', 'assign'),
	validationAssignInspector,
	validate,
	qcInspectionController.assignInspector,
);
router.post('/:id/start', checkPermission('quality-control', 'inspect'), qcInspectionController.startInspection);
router.put('/:id/items', checkPermission('quality-control', 'inspect'), validationSaveItems, validate, qcInspectionController.saveItems);
router.post('/:id/submit', checkPermission('quality-control', 'inspect'), qcInspectionController.submitInspection);
router.post('/:id/approve', checkPermission('quality-control', 'approve'), qcInspectionController.approveInspection);
router.post(
	'/:id/reject',
	checkPermission('quality-control', 'reject'),
	validationRejectOrCancel,
	validate,
	qcInspectionController.rejectInspection,
);
router.post(
	'/:id/cancel',
	checkPermission('quality-control', 'cancel'),
	validationRejectOrCancel,
	validate,
	qcInspectionController.cancelInspection,
);
router.post('/:id/reinspect', checkPermission('quality-control', 'create'), qcInspectionController.reinspect);
router.get('/:id/workflow', checkPermission('quality-control', 'view'), qcInspectionController.getInspectionWorkflow);

router.get('/:id/attachments', checkPermission('quality-control', 'view'), qcInspectionController.listAttachments);
router.post(
	'/:id/attachments',
	checkPermission('quality-control', 'inspect'),
	orderDocUpload.single('photo'),
	qcInspectionController.uploadAttachment,
);

router.post('/:id/html', checkPermission('quality-control', 'view'), qcInspectionController.generateInvoiceHtml);
router.post('/:id/pdf', checkPermission('quality-control', 'view'), qcInspectionController.downloadInvoicePdf);

router.get('/:id', checkPermission('quality-control', 'view'), qcInspectionController.getInspectionById);

module.exports = router;
