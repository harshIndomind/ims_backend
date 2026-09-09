const router = require('express').Router();
const c = require('../../controllers/payment-requisition.controller');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

// ── Utility ─────────────────────────────────────────────────────────────────
router.get('/generate-requisition-number', checkPermission('payment-requisition', 'view'), c.getNextRequisitionNo);

// ── Summaries ────────────────────────────────────────────────────────────────
// GET /payment-requisitions/po-wo-summary?type=PO&id=101
router.get('/po-wo-summary', checkPermission('payment-requisition', 'view'), c.getPoWoSummary);

// GET /payment-requisitions/deduction-analytics?type=PO&id=101
router.get('/deduction-analytics', checkPermission('payment-requisition', 'view'), c.getDeductionAnalytics);

// ── Retention Release ─────────────────────────────────────────────────────────
// POST /payment-requisitions/retention-release
router.post('/retention-release', checkPermission('payment-requisition', 'create'), c.createRetentionRelease);

// ── Requisition CRUD ──────────────────────────────────────────────────────────
router.post('/', checkPermission('payment-requisition', 'create'), c.createPaymentRequisition);
router.get('/', checkPermission('payment-requisition', 'view'), c.getAllPaymentRequisitions);
router.get('/:id', checkPermission('payment-requisition', 'view'), c.getPaymentRequisitionById);
router.put('/:id', checkPermission('payment-requisition', 'edit'), c.updatePaymentRequisition);
router.delete('/:id', checkPermission('payment-requisition', 'delete'), c.deletePaymentRequisition);

// ── Workflow (Approve / Reject) ──────────────────────────────────────────────
router.post('/:id/approve', checkPermission('payment-requisition', 'approver'), c.approvePaymentRequisition);
router.post('/:id/reject', checkPermission('payment-requisition', 'approver'), c.rejectPaymentRequisition);
router.get('/:id/workflow', checkPermission('payment-requisition', 'view'), c.getPaymentRequisitionWorkflow);

// ── Deduction sub-resources ───────────────────────────────────────────────────
// POST   /payment-requisitions/:id/deductions
// PUT    /payment-requisitions/:id/deductions/:deductionId
// DELETE /payment-requisitions/:id/deductions/:deductionId
router.post('/:id/deductions', checkPermission('payment-requisition', 'edit'), c.addDeduction);
router.put('/:id/deductions/:deductionId', checkPermission('payment-requisition', 'edit'), c.updateDeduction);
router.delete('/:id/deductions/:deductionId', checkPermission('payment-requisition', 'edit'), c.deleteDeduction);

// ── PDF / HTML ────────────────────────────────────────────────────────────────
router.post('/:id/html', checkPermission('payment-requisition', 'view'), c.generateRequisitionHtml);
router.post('/:id/pdf', checkPermission('payment-requisition', 'view'), c.downloadRequisitionPdf);

module.exports = router;
