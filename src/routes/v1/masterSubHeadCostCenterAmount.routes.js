const router = require('express').Router();
const controller = require('../../controllers/masterSubHeadCostCenterAmount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

// Reuses the 'sub-head-amount' permission slug — this is a sub-resource of Sub Head
// Amount (splitting one sub-head allocation across cost centers), not a standalone menu.
router.post(
	'/',
	checkPermission('sub-head-amount', 'create'),
	controller.createSubHeadCostCenterAmount,
);
router.put(
	'/:id',
	checkPermission('sub-head-amount', 'edit'),
	controller.updateSubHeadCostCenterAmount,
);

router.get(
	'/',
	checkPermission('sub-head-amount', 'view'),
	controller.getAllSubHeadCostCenterAmount,
);

router.get(
	'/:id',
	checkPermission('sub-head-amount', 'view'),
	controller.getSubHeadCostCenterAmountById,
);

router.delete(
	'/:id',
	checkPermission('sub-head-amount', 'delete'),
	controller.deleteSubHeadCostCenterAmount,
);

module.exports = router;
