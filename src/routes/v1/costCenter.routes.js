const router = require('express').Router();
const CostCenterController = require('../../controllers/costCenter.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validationCreateCostCenter, validationUpdateCostCenter } = require('../../validations/CostCenter.validator');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('cost-center', 'create'),
	validationCreateCostCenter,
	validate,
	CostCenterController.createCostCenter
);
router.put(
	'/:id',
	checkPermission('cost-center', 'edit'),
	validationUpdateCostCenter,
	validate,
	CostCenterController.updateCostCenter
);
router.get(
	'/',
	checkPermission('cost-center', 'view'),
	CostCenterController.getAllCostCenter
);
router.get(
	'/:id',
	checkPermission('cost-center', 'view'),
	CostCenterController.getCostCenterById
);
router.delete(
	'/:id',
	checkPermission('cost-center', 'delete'),
	CostCenterController.deleteCostCenter
);

module.exports = router;
