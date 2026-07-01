const express = require('express');
const router = express.Router();
const grnController = require('../../controllers/grn.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/generate-grn-number', grnController.generateGrnNumber);
router.get('/', grnController.getAllGRNs);
router.post('/', grnController.createGRN);
router.get('/purchase-order/:purchaseOrderId', grnController.getGRNsByPurchaseOrder);
router.get('/:id', grnController.getGRNById);
router.patch('/:id/cancel', grnController.cancelGRN);

module.exports = router;
