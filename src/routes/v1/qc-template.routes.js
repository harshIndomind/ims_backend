const express = require('express');
const router = express.Router();
const qcTemplateController = require('../../controllers/qc-template.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.post('/', checkPermission('quality-control', 'manage_templates'), qcTemplateController.createTemplate);
router.get('/', checkPermission('quality-control', 'view'), qcTemplateController.getAllTemplates);
router.get('/:id', checkPermission('quality-control', 'view'), qcTemplateController.getTemplateById);
router.delete('/:id', checkPermission('quality-control', 'manage_templates'), qcTemplateController.deactivateTemplate);

module.exports = router;
