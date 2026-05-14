const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/user.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadTo } = require('../../middlewares/multer');
const checkPermission = require('../../middlewares/checkPermission');
const checkSyncHrms = require('../../middlewares/checkSyncHrms');

router.post('/forgot-password', UserController.sendForgotPasswordMail);
router.post('/reset-password', UserController.resetPassword);

router.use(verifyToken);

router.get('/', checkPermission('users', 'view'), UserController.getAllUsers);

router.post('/', checkSyncHrms, checkPermission('users', 'create'), UserController.createUser);

router.get(
	'/profile',
	checkPermission('profile', 'view'),
	UserController.getUserProfileById,
);
router.put(
	'/profile',
	checkPermission('profile', 'edit'),
	uploadTo('uploads/profile').fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'logo', maxCount: 1 },
	]),
	UserController.updateUserProfile,
);
router.put('/:id', checkPermission('users', 'edit'), UserController.updateUser);
router.patch('/:id/deactivate', checkPermission('users', 'edit'), UserController.deactivateUser);
router.patch('/:id/activate', checkPermission('users', 'edit'), UserController.activateUser);
router.delete(
	'/:id',
	checkPermission('users', 'delete'),
	UserController.destroy,
);

router.get(
	'/:id',
	checkPermission(['users', 'profile'], 'view'),
	UserController.getUserById,
);

module.exports = router;
