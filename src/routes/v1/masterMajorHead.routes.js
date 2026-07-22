const router = require('express').Router();
const MasterMajorHeadController = require('../../controllers/majorHead.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('major-head', 'create'),
	MasterMajorHeadController.createMasterMajorHead
);
router.put(
	'/:id',
	checkPermission('major-head', 'edit'),
	MasterMajorHeadController.updateMasterMajorHead
);
router.get(
	'/',
	checkPermission('major-head', 'view'),
	MasterMajorHeadController.getAllMasterMajorHead
);
router.get(
	'/:id',
	checkPermission('major-head', 'view'),
	MasterMajorHeadController.getMasterMajorHeadById
);
router.delete(
	'/:id',
	checkPermission('major-head', 'delete'),
	MasterMajorHeadController.deleteMasterMajorHead
);

module.exports = router;
