const router = require('express').Router();
const orderDispatchLookupController = require('../../controllers/orderDispatchLookup.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

// Shared lookup lists consumed by both the PO and WO dispatch/acknowledge modals.
router.get(
	'/dispatch-methods',
	checkPermission(['purchase-order', 'work-order'], 'view'),
	orderDispatchLookupController.getDispatchMethods,
);
router.get(
	'/acknowledgement-modes',
	checkPermission(['purchase-order', 'work-order'], 'view'),
	orderDispatchLookupController.getAcknowledgementModes,
);
router.get(
	'/qc-rejection-reasons',
	checkPermission('quality-control', 'view'),
	orderDispatchLookupController.getQcRejectionReasons,
);
router.get(
	'/short-close-reasons',
	checkPermission('short-close', 'view'),
	orderDispatchLookupController.getShortCloseReasons,
);

module.exports = router;
