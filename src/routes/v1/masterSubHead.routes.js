const router = require('express').Router();
const MasterSubHeadController = require('../../controllers/subHead.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.createMasterSubHead
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.updateMasterSubHead
);
router.get(
	'/latestSubCode',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.latestSubCode
);

router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.getAllMasterSubHead
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.getMasterSubHeadById
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterSubHeadController.deleteMasterSubHead
);

module.exports = router;
