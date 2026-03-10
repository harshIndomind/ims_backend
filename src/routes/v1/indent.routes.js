const router = require('express').Router();
const indentController = require('../../controllers/indent.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('indent', 'create'),
	indentController.createIndent,
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
	'/:id/approve',
	checkPermission('indent', 'view'),
	indentController.verifyAndApproveIndent,
);

router.get(
	'/budget/:budget_id',
	checkPermission('indent', 'view'),
	indentController.lastIndentByBudgetId,
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
