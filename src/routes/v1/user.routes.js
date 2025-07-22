const express = require('express')
const router = express.Router();
const UserController = require('../../controllers/user.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const uploadTo = require('../../middlewares/multer')

router.post('/forgot-password', UserController.sendForgotPasswordMail);
router.post('/reset-password', UserController.resetPassword);

router.use(verifyToken);

router.post('/',checkRole(['Super Admin', 'Admin']), UserController.create);
router.get('/profile',checkRole(['Super Admin', 'Admin','Project Tech Head', 'User', 'Support Engineer']), UserController.getUserProfileById);
// router.put('/profile',checkRole(['Super Admin', 'Admin','Project Tech Head', 'User', 'Support Engineer']), uploadTo.single('image'), UserController.updateUserProfile);
router.put('/:id',checkRole(['Super Admin', 'Admin']), UserController.update);
router.delete('/:id',checkRole(['Super Admin', 'Admin']), UserController.destroy);
router.get('/',checkRole(['Super Admin', 'Admin']), UserController.getAllUsers);
router.get('/:id',checkRole(['Super Admin', 'Admin']), UserController.getUserById);
router.get('/company/:company_id/project/:project_id',checkRole(['Super Admin', 'Admin','Project Tech Head', 'User', 'Support Engineer']), UserController.getTechSupportUsers);

module.exports = router;