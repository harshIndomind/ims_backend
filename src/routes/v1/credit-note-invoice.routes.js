const express = require('express');
const router = express.Router();
const creditNoteInvoiceController = require('../../controllers/credit-note-invoice.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);
const { upload } = require('../../middlewares/multer');

router.get('/generate-invoice-number', creditNoteInvoiceController.generateInvoiceNumber);
router.get('/get-invoices/:partnerId', creditNoteInvoiceController.getInvoicesNo);
router.post('/', creditNoteInvoiceController.createInvoice);
router.get('/', creditNoteInvoiceController.getInvoices);
router.get('/export', creditNoteInvoiceController.exportSaleInvoices);

router.get('/payments', creditNoteInvoiceController.getPayments);

router.get('/generate-receipt-number', creditNoteInvoiceController.generatePaymentRecieptNumber);
router.post('/payment', upload.array('documents[]', 5), creditNoteInvoiceController.createPaymentReceipt);
router.put('/payment/:id', upload.array('documents[]', 5), creditNoteInvoiceController.updatePaymentReceipt);
router.get('/customer/:id', creditNoteInvoiceController.getInvoicesByCustomerId);

router.delete('/payments/:id', creditNoteInvoiceController.deletePaymentReceipt);
router.get('/payments/:id', creditNoteInvoiceController.getPaymentReceipt);
router.get('/:id', creditNoteInvoiceController.getInvoiceById);
router.put('/:id', creditNoteInvoiceController.updateInvoice);
router.delete('/:id', creditNoteInvoiceController.deleteInvoice);
router.post('/:id/html', creditNoteInvoiceController.generateInvoiceHtml);
router.post('/:id/pdf', creditNoteInvoiceController.downloadInvoicePdf);
    
module.exports = router;
