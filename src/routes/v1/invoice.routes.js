const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/invoice.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/generate-invoice-number', invoiceController.generateInvoiceNumber);
router.post('/', invoiceController.createInvoice);
router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.put('/:id', invoiceController.updateInvoice);
router.delete('/:id', invoiceController.deleteInvoice);
router.post('/:id/html', invoiceController.generateInvoiceHtml);
router.post('/:id/pdf', invoiceController.downloadInvoicePdf);

module.exports = router;
