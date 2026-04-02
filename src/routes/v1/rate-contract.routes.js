const router = require('express').Router();
const RateContractController = require('../../controllers/rate-contract.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.post(
	'/',
	checkPermission('rate-contract', 'create'),
	RateContractController.createRateContract
);
router.put(
	'/:id',
	checkPermission('rate-contract', 'edit'),
	RateContractController.updateRateContract
);
router.get(
	'/',
	checkPermission('rate-contract', 'view'),
	RateContractController.getAllRateContract
);

router.get(
	'/:product_id/check',
	checkPermission('rate-contract', 'view'),
	RateContractController.getRateContractByProductId
);

router.get(
	'/:id',
	checkPermission('rate-contract', 'view'),
	RateContractController.getRateContractById
);
router.delete(
	'/:id',
	checkPermission('rate-contract', 'delete'),
	RateContractController.deleteRateContract
);

module.exports = router;
