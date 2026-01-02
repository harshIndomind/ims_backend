const router = require('express').Router();
const MasterMajorHeadController = require('../../controllers/majorHead.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadController.createMasterMajorHead
);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadController.updateMasterMajorHead
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadController.getAllMasterMajorHead
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadController.getMasterMajorHeadById
);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	MasterMajorHeadController.deleteMasterMajorHead
);

module.exports = router;
