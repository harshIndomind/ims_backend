const express = require('express');
const router = express.Router();
const adminUserController = require('../../controllers/admin-user.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.post('/', verifyToken, adminUserController.createUserByOrganization);
router.get('/', verifyToken, adminUserController.getAllOrgAdminUsers);

router.get('/:id', verifyToken, adminUserController.findOne);
router.put('/:id', verifyToken, adminUserController.update);
// router.delete('/:id', verifyToken, adminUserController.remove);

module.exports = router;
