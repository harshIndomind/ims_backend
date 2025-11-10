const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/invoice.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);
const { upload } = require('../../middlewares/multer');

router.get('/generate-invoice-number', invoiceController.generateInvoiceNumber);
router.post('/', invoiceController.createInvoice);
router.get('/', invoiceController.getInvoices);
router.get('/export', invoiceController.exportSaleInvoices);

router.get('/payments', invoiceController.getPayments);

router.get('/generate-receipt-number', invoiceController.generatePaymentRecieptNumber);
router.post('/payment', upload.array('documents[]', 5), invoiceController.createPaymentReceipt);
router.put('/payment/:id', upload.array('documents[]', 5), invoiceController.updatePaymentReceipt);
router.get('/customer/:id', invoiceController.getInvoicesByCustomerId);

router.delete('/payments/:id', invoiceController.deletePaymentReceipt);
router.get('/payments/:id', invoiceController.getPaymentReceipt);
router.get('/:id', invoiceController.getInvoiceById);
router.put('/:id', invoiceController.updateInvoice);
router.delete('/:id', invoiceController.deleteInvoice);
router.post('/:id/html', invoiceController.generateInvoiceHtml);
router.post('/:id/pdf', invoiceController.downloadInvoicePdf);
    
module.exports = router;
