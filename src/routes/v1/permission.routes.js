const express = require('express');
const router = express.Router();
const PermissionController = require('../../controllers/permission.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);

// Named sub-paths must come BEFORE /:id to avoid Express treating them as IDs
router.get('/by-menu', PermissionController.getPermissionsByMenu);
router.post('/menu/:menuId', PermissionController.setMenuPermissions);

router.post('/', PermissionController.create);
router.put('/:id', PermissionController.update);
router.delete('/:id', PermissionController.destory);
router.get('/:id', PermissionController.getPermissionById);
router.get('/', PermissionController.getAllPermissions);

module.exports = router;
