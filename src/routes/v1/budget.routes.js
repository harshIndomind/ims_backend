const router = require('express').Router();
const budgetController = require('../../controllers/budget.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post('/', budgetController.createBudget);
router.get('/', budgetController.getAllBudgets);
router.post('/approve', budgetController.approveBudget);

router.get(
	'/amount/period/:period_id/majorhead/:major_head_id',
	checkRole(['Super Admin', 'Admin']),
	budgetController.getAmountByMajorHeadAndPeriodAndSubHead
);

router.get(
	'/amount/period/:period_id/majorhead/:major_head_id/subhead/:subhead_id',
	checkRole(['Super Admin', 'Admin']),
	budgetController.getAmountByMajorHeadAndPeriodAndSubHead
);

router.get('/:id', budgetController.getBudgetById);
router.put('/:id', budgetController.updateBudget);
router.delete('/:id', budgetController.deleteBudget);

module.exports = router;
