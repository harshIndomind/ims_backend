const express = require('express');
const router = express.Router();
const shortCloseController = require('../../controllers/short-close.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const { validate } = require('../../middlewares/validate');
const {
	validationGetShortCloseableItems,
	validationCreateShortCloseRequest,
	validationRejectOrCancel,
} = require('../../validations/ShortClose.validator');

router.use(verifyToken);

router.get('/generate-request-number', checkPermission('short-close', 'view'), shortCloseController.generateRequestNumber);

router.get(
	'/document/:document_type/:document_id/short-closeable-items',
	checkPermission('short-close', 'view'),
	validationGetShortCloseableItems,
	validate,
	shortCloseController.getShortCloseableItems,
);

router.post(
	'/',
	checkPermission('short-close', 'create'),
	validationCreateShortCloseRequest,
	validate,
	shortCloseController.createShortCloseRequest,
);
router.get('/', checkPermission('short-close', 'view'), shortCloseController.getAllShortCloseRequests);

router.post('/:id/approve', checkPermission('short-close', 'approve'), shortCloseController.approveShortCloseRequest);
router.post(
	'/:id/reject',
	checkPermission('short-close', 'reject'),
	validationRejectOrCancel,
	validate,
	shortCloseController.rejectShortCloseRequest,
);
router.post(
	'/:id/cancel',
	checkPermission('short-close', 'cancel'),
	validationRejectOrCancel,
	validate,
	shortCloseController.cancelShortCloseRequest,
);
router.get('/:id/workflow', checkPermission('short-close', 'view'), shortCloseController.getShortCloseWorkflow);

router.get('/:id', checkPermission('short-close', 'view'), shortCloseController.getShortCloseRequestById);

module.exports = router;
