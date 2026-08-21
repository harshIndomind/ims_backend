const express = require('express');
const router = express.Router();
const grnController = require('../../controllers/grn.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.get('/generate-grn-number', checkPermission('goods-receipt-note', 'view'), grnController.generateGrnNumber);
router.get('/', checkPermission('goods-receipt-note', 'view'), grnController.getAllGRNs);
router.post('/', checkPermission('goods-receipt-note', 'create'), grnController.createGRN);
router.get('/purchase-order/:purchaseOrderId', checkPermission('goods-receipt-note', 'view'), grnController.getGRNsByPurchaseOrder);
router.get(
	'/purchase-order/:purchaseOrderId/receivable',
	checkPermission('goods-receipt-note', 'view'),
	grnController.getReceivableLinesForPurchaseOrder,
);
router.get('/:id', checkPermission('goods-receipt-note', 'view'), grnController.getGRNById);
router.patch('/:id/cancel', checkPermission('goods-receipt-note', 'cancel'), grnController.cancelGRN);

module.exports = router;
