const router = require('express').Router();
const MasterAccountController = require('../../controllers/masterAccount.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	// checkPermission('cost-center', 'create'),
	MasterAccountController.createMasterAccount
);
router.put(
	'/:id',
	// checkPermission('cost-center', 'edit'),
	MasterAccountController.updateMasterAccount
);
router.get(
	'/',
	// checkPermission('cost-center', 'view'),
	MasterAccountController.getAllMasterAccount
);
router.get(
	'/:id',
	// checkPermission('cost-center', 'view'),
	MasterAccountController.getMasterAccountById
);
router.delete(
	'/:id',
	// checkPermission('cost-center', 'delete'),
	MasterAccountController.deleteMasterAccount
);

module.exports = router;
