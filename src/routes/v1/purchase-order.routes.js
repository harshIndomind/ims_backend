const express = require('express');
const router = express.Router();
const purchaseController = require('../../controllers/purchase-order.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);
const { upload } = require('../../middlewares/multer');

router.get('/generate-po-number', purchaseController.generatePoNumber);
router.get('/export', purchaseController.exportPurchaseOrders);
router.post('/', purchaseController.createPurchaseOrder);
router.get('/', purchaseController.getAllPurchaseOrders);

// router.get('/payments', purchaseController.getPayments);

// router.get('/generate-receipt-number', purchaseController.generatePaymentRecieptNumber);
// router.post('/payment', upload.array('documents[]', 5), purchaseController.createPaymentReceipt);
// router.put('/payment/:id', upload.array('documents[]', 5), purchaseController.updatePaymentReceipt);
// router.get('/customer/:id', purchaseController.getInvoicesByCustomerId);

// router.patch('/cancel/:id', purchaseController.cancelInvoice);
// router.patch('/restore/:id', purchaseController.restoreInvoice);
// router.delete('/payments/:id', purchaseController.deletePaymentReceipt);
// router.get('/payments/:id', purchaseController.getPaymentReceipt);
router.get('/:id', purchaseController.getPurchaseOrderById);
router.put('/:id', purchaseController.updatePurchaseOrder);
router.delete('/:id', purchaseController.deletePurchaseOrder);
router.post('/:id/html', purchaseController.generateInvoiceHtml);
router.post('/:id/pdf', purchaseController.downloadInvoicePdf);
    
module.exports = router;
