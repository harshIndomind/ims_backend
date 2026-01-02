const router = require('express').Router();
const MasterSubHeadAmountController = require('../../controllers/subHeadAmount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected


router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.createSubHeadAmount
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.updateSubHeadAmount
);

router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.getAllSubHeadAmount
);

router.get(
	':id/majorhead/:major_head_id/period/:period_id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.getAmountByMajorHeadAndPeriod
);

router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.getSubHeadAmountById
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadAmountController.deleteSubHeadAmount
);

module.exports = router;
