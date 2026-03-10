const router = require('express').Router();
const MasterMajorHeadAmountController = require('../../controllers/majorHeadAmount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected


router.post(
	'/',
	checkPermission('major-head-amount', 'create'),
	MasterMajorHeadAmountController.createMasterMajorHeadAmount
);
router.put(
	'/:id',
	checkPermission('major-head-amount', 'edit'),
	MasterMajorHeadAmountController.updateMasterMajorHeadAmount
);

router.get(
	'/',
	checkPermission('major-head-amount', 'view'),
	MasterMajorHeadAmountController.getAllMasterMajorHeadAmount
);

router.get(
	'/majorhead/:major_head_id/period/:period_id',
	checkPermission('major-head-amount', 'view'),
	MasterMajorHeadAmountController.getAmountByMajorHeadAndPeriod
);

router.get(
	'/:id',
	checkPermission('major-head-amount', 'view'),
	MasterMajorHeadAmountController.getMasterMajorHeadAmountById
);
router.delete(
	'/:id',
	checkPermission('major-head-amount', 'delete'),
	MasterMajorHeadAmountController.deleteMasterMajorHeadAmount
);

module.exports = router;
