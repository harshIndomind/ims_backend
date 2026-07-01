const express = require('express');
const router = express.Router();
const purchaseController = require('../../controllers/purchase-order.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/generate-po-number', purchaseController.generatePoNumber);
router.get('/export', purchaseController.exportPurchaseOrders);
router.post('/', purchaseController.createPurchaseOrder);
router.get('/', purchaseController.getAllPurchaseOrders);
router.get('/:id', purchaseController.getPurchaseOrderById);
router.put('/:id', purchaseController.updatePurchaseOrder);
router.delete('/:id', purchaseController.deletePurchaseOrder);
router.post('/:id/html', purchaseController.generateInvoiceHtml);
router.post('/:id/pdf', purchaseController.downloadInvoicePdf);
    
module.exports = router;
