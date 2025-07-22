const express = require('express');
const router = express.Router();
const RolesPermissionController = require('../../controllers/roles-permission.controller');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

router.post('/', checkRole(['Super Admin', 'Admin']), RolesPermissionController.create);
router.put('/', checkRole(['Super Admin', 'Admin']), RolesPermissionController.update);
router.delete('/:id', checkRole(['Super Admin', 'Admin']), RolesPermissionController.destroy);
router.get('/', checkRole(['Super Admin', 'Admin']), RolesPermissionController.getAll);
router.get('/:id', RolesPermissionController.getByRoleId);

module.exports = router;
