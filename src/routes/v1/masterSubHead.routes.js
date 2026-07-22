const router = require('express').Router();
const MasterSubHeadController = require('../../controllers/subHead.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('sub-head', 'create'),
	MasterSubHeadController.createMasterSubHead
);
router.put(
	'/:id',
	checkPermission('sub-head', 'edit'),
	MasterSubHeadController.updateMasterSubHead
);
router.get(
	'/latestSubCode',
	checkPermission('sub-head', 'view'),
	MasterSubHeadController.latestSubCode
);

router.get(
	'/',
	checkPermission('sub-head', 'view'),
	MasterSubHeadController.getAllMasterSubHead
);
router.get(
	'/:id',
	checkPermission('sub-head', 'view'),
	MasterSubHeadController.getMasterSubHeadById
);
router.delete(
	'/:id',
	checkPermission('sub-head', 'delete'),
	MasterSubHeadController.deleteMasterSubHead
);

module.exports = router;
