const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/user.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadTo } = require('../../middlewares/multer');
const checkPermission = require('../../middlewares/checkPermission');
const fetchPermissions = require('../../helpers/fetchPermissions');

router.post('/forgot-password', UserController.sendForgotPasswordMail);
router.post('/reset-password', UserController.resetPassword);

router.use(verifyToken);

router.post('/', checkRole(['Super Admin', 'Admin']), UserController.create);
router.get(
	'/profile',
	checkPermission('account', 'view'),
	UserController.getUserProfileById
);
router.put(
	'/profile',
	checkPermission('account', 'edit'),
	uploadTo('uploads/profile').fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'logo', maxCount: 1 },
	]),
	UserController.updateUserProfile
);
router.put('/:id', checkRole(['Super Admin', 'Admin']), UserController.update);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	UserController.destroy
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	UserController.getAllUsers
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	UserController.getUserById
);
router.get(
	'/company/:company_id/project/:project_id',
	checkRole([
		'Super Admin',
		'Admin',
		'Project Tech Head',
		'User',
		'Support Engineer',
	]),
	UserController.getTechSupportUsers
);

module.exports = router;
