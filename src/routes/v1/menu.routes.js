const express = require('express');
const router = express.Router();
const MenuController = require('../../controllers/menu.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const checkPermission = require('../../middlewares/_checkPermission');

router.use(verifyToken);

router.post('/', MenuController.create);
router.get(
  '/permissions',
  verifyToken,
//   checkPermission('roles', 'view'),
  MenuController.getMenusWithPermissions
);
router.put('/:id', MenuController.update);
router.get('/', MenuController.getMenus);
router.get('/parent', MenuController.getParentMenus);
router.get('/:id', MenuController.getMenuById);
router.delete('/:id', MenuController.delete);

module.exports = router;
