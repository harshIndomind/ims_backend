const express = require('express');
const router = express.Router();
const workOrderController = require('../../controllers/work-order.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.get('/generate-wo-number', workOrderController.generateWoNumber);
router.get('/export', workOrderController.exportWorkOrders);
router.post('/', workOrderController.createWorkOrder);
router.get('/', workOrderController.getAllWorkOrders);
router.get('/:id', workOrderController.getWorkOrderById);
router.put('/:id', workOrderController.updateWorkOrder);
router.delete('/:id', workOrderController.deleteWorkOrder);
router.post('/:id/html', workOrderController.generateInvoiceHtml);
router.post('/:id/pdf', workOrderController.downloadInvoicePdf);

module.exports = router;
