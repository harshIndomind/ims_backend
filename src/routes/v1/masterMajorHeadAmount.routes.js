const router = require('express').Router();
const MasterMajorHeadAmountController = require('../../controllers/majorHeadAmount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected


router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.createMasterMajorHeadAmount
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.updateMasterMajorHeadAmount
);

router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.getAllMasterMajorHeadAmount
);

router.get(
	'/majorhead/:major_head_id/period/:period_id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.getAmountByMajorHeadAndPeriod
);

router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.getMasterMajorHeadAmountById
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadAmountController.deleteMasterMajorHeadAmount
);

module.exports = router;
