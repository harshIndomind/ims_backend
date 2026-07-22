const express = require('express');
const router = express.Router();
const MenuController = require('../../controllers/menu.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/checkPermission');

router.use(verifyToken);

router.post('/', MenuController.create);
router.get(
  '/permissions',
  checkPermission('roles-permissions', 'view'),
  MenuController.getMenusWithPermissions
);
router.put('/:id', MenuController.update);
router.get('/', MenuController.getMenus);
router.get('/parent', MenuController.getParentMenus);
router.get('/:id', MenuController.getMenuById);
router.delete('/:id', MenuController.delete);

module.exports = router;
