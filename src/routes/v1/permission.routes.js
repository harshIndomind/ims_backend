const express = require('express');
const router = express.Router();
const PermissionController = require('../../controllers/permission.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

// Named sub-paths must come BEFORE /:id to avoid Express treating them as IDs
// Menu-action catalogue (which actions exist per menu): super_admin only for writes
router.get('/by-menu', checkPermission('roles-permissions', 'view'), PermissionController.getPermissionsByMenu);
router.post('/menu/:menuId', checkRole(['super_admin']), PermissionController.setMenuPermissions);

// Permission master catalogue: only super_admin may mutate it
router.post('/', checkRole(['super_admin']), PermissionController.create);
router.put('/:id', checkRole(['super_admin']), PermissionController.update);
router.delete('/:id', checkRole(['super_admin']), PermissionController.destory);

// Reads are allowed for anyone with role-permissions view access
router.get('/', checkPermission('roles-permissions', 'view'), PermissionController.getAllPermissions);
router.get('/:id', checkPermission('roles-permissions', 'view'), PermissionController.getPermissionById);

module.exports = router;
