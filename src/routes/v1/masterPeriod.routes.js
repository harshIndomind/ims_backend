const router = require('express').Router();
const MasterPeriodController = require('../../controllers/masterPeriod.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.createMasterPeriod
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.updateMasterPeriod
);

router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.getAllMasterPeriod
);
router.get(
	'/majorhead/:major_head_id',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.getMasterPeriodByMajorHead
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.getMasterPeriodById
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterPeriodController.deleteMasterPeriod
);

module.exports = router;
