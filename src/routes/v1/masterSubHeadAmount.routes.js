const router = require('express').Router();
const MasterSubHeadAmountController = require('../../controllers/subHeadAmount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected


router.post(
	'/',
	checkPermission('sub-head-amount', 'create'),
	MasterSubHeadAmountController.createSubHeadAmount
);
router.put(
	'/:id',
	checkPermission('sub-head-amount', 'edit'),
	MasterSubHeadAmountController.updateSubHeadAmount
);

router.get(
	'/',
	checkPermission('sub-head-amount', 'view'),
	MasterSubHeadAmountController.getAllSubHeadAmount
);

router.get(
	'/:id/majorhead/:major_head_id/period/:period_id',
	checkPermission('sub-head-amount', 'view'),
	MasterSubHeadAmountController.getAmountByMajorHeadAndPeriod
);

router.get(
	'/:id',
	checkPermission('sub-head-amount', 'view'),
	MasterSubHeadAmountController.getSubHeadAmountById
);
router.delete(
	'/:id',
	checkPermission('sub-head-amount', 'delete'),
	MasterSubHeadAmountController.deleteSubHeadAmount
);

module.exports = router;
