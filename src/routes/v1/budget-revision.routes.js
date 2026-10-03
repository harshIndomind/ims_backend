const express = require('express');
const router = express.Router();
const budgetRevisionController = require('../../controllers/budget-revision.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const {
	validationCreateBudgetRevision,
	validationRejectOrCancel,
} = require('../../validations/BudgetRevision.validator');

router.use(verifyToken);

router.post(
	'/',
	checkPermission('budget-revision', 'create'),
	validationCreateBudgetRevision,
	validate,
	budgetRevisionController.createBudgetRevision,
);
router.get('/', checkPermission('budget-revision', 'view'), budgetRevisionController.getAllBudgetRevisions);

router.post('/:id/approve', checkPermission('budget-revision', 'approve'), budgetRevisionController.approveBudgetRevision);
router.post(
	'/:id/reject',
	checkPermission('budget-revision', 'reject'),
	validationRejectOrCancel,
	validate,
	budgetRevisionController.rejectBudgetRevision,
);
router.post(
	'/:id/cancel',
	checkPermission('budget-revision', 'cancel'),
	validationRejectOrCancel,
	validate,
	budgetRevisionController.cancelBudgetRevision,
);
router.get('/:id/workflow', checkPermission('budget-revision', 'view'), budgetRevisionController.getBudgetRevisionWorkflow);

router.get('/:id', checkPermission('budget-revision', 'view'), budgetRevisionController.getBudgetRevisionById);

module.exports = router;
