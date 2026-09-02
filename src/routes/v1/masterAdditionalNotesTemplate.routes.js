const router = require('express').Router();
const MasterAdditionalNotesTemplateController = require('../../controllers/masterAdditionalNotesTemplate.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.get(
	'/by-vendor',
	checkPermission('additional-notes-template', 'view'),
	MasterAdditionalNotesTemplateController.getTemplateForVendor,
);

router.post(
	'/',
	checkPermission('additional-notes-template', 'create'),
	MasterAdditionalNotesTemplateController.createTemplate,
);
router.get(
	'/',
	checkPermission('additional-notes-template', 'view'),
	MasterAdditionalNotesTemplateController.getAllTemplates,
);
router.get(
	'/:id',
	checkPermission('additional-notes-template', 'view'),
	MasterAdditionalNotesTemplateController.getTemplateById,
);
router.put(
	'/:id',
	checkPermission('additional-notes-template', 'edit'),
	MasterAdditionalNotesTemplateController.updateTemplate,
);
router.delete(
	'/:id',
	checkPermission('additional-notes-template', 'delete'),
	MasterAdditionalNotesTemplateController.deleteTemplate,
);

module.exports = router;