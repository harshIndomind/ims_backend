const router = require('express').Router();
const budgetController = require('../../controllers/budget.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('budget', 'create'),
	budgetController.createBudget,
);
router.get(
	'/report/download',
	checkPermission('budget', 'export'),
	budgetController.downloadBudgetReport,
);
router.get(
	'/',
	checkPermission('budget', 'view'),
	budgetController.getAllBudgets,
);
router.get(
	'/approved',
	checkPermission('budget', 'view'),
	budgetController.getAllApprovedBudgets,
);
router.post(
	'/approve',
	checkPermission('budget', 'approver'),
	budgetController.approveBudget,
);

router.get(
	'/amount/period/:period_id/majorhead/:major_head_id',
	checkPermission('budget', 'view'),
	budgetController.getAmountByMajorHeadAndPeriodAndSubHead,
);

router.get(
	'/amount/period/:period_id/majorhead/:major_head_id/subhead/:subhead_id',
	checkPermission('budget', 'view'),
	budgetController.getAmountByMajorHeadAndPeriodAndSubHead,
);

router.get(
	'/:id',
	checkPermission('budget', 'view'),
	budgetController.getBudgetById,
);
router.put(
	'/:id',
	checkPermission('budget', 'edit'),
	budgetController.updateBudget,
);
router.delete(
	'/:id',
	checkPermission('budget', 'delete'),
	budgetController.deleteBudget,
);

module.exports = router;
