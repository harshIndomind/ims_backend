const router = require('express').Router();
const indentController = require('../../controllers/indent.controller');
const indentDocumentController = require('../../controllers/indentDocument.controller');
const { upload: indentDocUpload } = require('../../middlewares/indentDocumentUpload');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('indent', 'create'),
	indentController.createIndent,
);
router.get(
	'/report/download',
	checkPermission('indent', 'export'),
	indentController.downloadIndentReport,
);
router.delete(
	'/report/file',
	checkPermission('indent', 'export'),
	indentController.cleanupIndentReport,
);
router.get(
	'/',
	checkPermission('indent', 'view'),
	indentController.getAllIndents,
);

router.post(
	'/verify-quantity',
	checkPermission('indent', 'view'),
	indentController.verifyIndentQuantity,
);

router.post(
	'/:id/verify',
	checkPermission('indent', 'verify'),
	indentController.verifyIndent,
);

router.post(
	'/:id/approve',
	checkPermission('indent', 'approve'),
	indentController.approveIndent,
);

router.post(
	'/:id/reissue/preview',
	checkPermission('indent', 'approve'),
	indentController.previewReissue,
);

router.post(
	'/:id/reissue',
	checkPermission('indent', 'approve'),
	indentController.reissueIndent,
);

router.post(
	'/:id/reject',
	checkPermission('indent', 'reject'),
	indentController.rejectIndent,
);

router.post(
	'/:id/cancel',
	checkPermission('indent', 'cancel'),
	indentController.cancelIndent,
);

router.post(
	'/:id/reopen',
	checkPermission('indent', 'reopen'),
	indentController.reopenIndent,
);

router.post(
	'/:id/archive',
	checkPermission('indent', 'archive'),
	indentController.archiveIndent,
);

router.post(
	'/:id/restore',
	checkPermission('indent', 'archive'),
	indentController.restoreIndent,
);

router.put(
	'/:id',
	checkPermission('indent', 'edit'),
	indentController.updateIndent,
);

router.get(
	'/:id/workflow',
	checkPermission('indent', 'view'),
	indentController.getIndentWorkflow,
);

router.get(
	'/budget/:budget_id',
	checkPermission('indent', 'view'),
	indentController.lastIndentByBudgetId,
);

// [2026-06-03] New route: returns total consumed amount/qty for a budget's current phase.
// WHY: The old /budget/:budget_id route only returned the last single IndentItem. The
// frontend needs aggregate totals across ALL previous indents to enforce phase budget
// limits before the user submits a new indent.
router.get(
	'/budget/:budget_id/consumed',
	checkPermission('indent', 'view'),
	indentController.getConsumedBudgetByBudgetId,
);

router.get(
	'/product-services/:productId',
	checkPermission('indent', 'view'),
	indentController.checkProductQuantity,
);

router.get(
	'/product-services/:productId/uom/:uomId',
	checkPermission('indent', 'view'),
	indentController.checkProductQuantity,
);

router.get(
	'/lastestIndentId',
	checkPermission('indent', 'view'),
	indentController.getNextIndentId,
);

// Document upload/list/delete — must sit before the bare /:id GET below
router.post(
	'/:id/documents',
	checkPermission('indent', 'view'),
	indentDocUpload.array('documents', 10),
	indentDocumentController.uploadDocuments,
);

router.get(
	'/:id/documents',
	checkPermission('indent', 'view'),
	indentDocumentController.getDocuments,
);

router.delete(
	'/:id/documents/:docId',
	checkPermission('indent', 'edit'),
	indentDocumentController.deleteDocument,
);

// Must be registered after every other literal-segment GET route above (e.g.
// /lastestIndentId) — as a single :id param it would otherwise greedily match them.
router.get(
	'/:id',
	checkPermission('indent', 'view'),
	indentController.getIndentById,
);

router.delete(
	'/:id',
	checkPermission('indent', 'delete'),
	indentController.deleteIndent,
);

// router.get(
// 	'/',
// 	checkPermission('indent', 'view'),
// 	indentController.getAllBudgets,
// );
// router.get(
// 	'/approved',
// 	checkPermission('indent', 'view'),
// 	indentController.getAllApprovedBudgets,
// );
// router.post(
// 	'/approve',
// 	checkPermission('indent', 'approver'),
// 	indentController.approveBudget,
// );

// router.get(
// 	'/amount/period/:period_id/majorhead/:major_head_id',
// 	checkPermission('indent', 'view'),
// 	indentController.getAmountByMajorHeadAndPeriodAndSubHead,
// );

// router.get(
// 	'/amount/period/:period_id/majorhead/:major_head_id/subhead/:subhead_id',
// 	checkPermission('indent', 'view'),
// 	indentController.getAmountByMajorHeadAndPeriodAndSubHead,
// );

// router.get(
// 	'/:id',
// 	checkPermission('indent', 'view'),
// 	indentController.getBudgetById,
// );
// router.put(
// 	'/:id',
// 	checkPermission('indent', 'edit'),
// 	indentController.updateBudget,
// );
// router.delete(
// 	'/:id',
// 	checkPermission('indent', 'delete'),
// 	indentController.deleteBudget,
// );

module.exports = router;
