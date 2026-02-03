const express = require('express');
const router = express.Router();
const serviceUserController = require('../../controllers/service-user.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadTo } = require('../../middlewares/multer');
const verifyServiceToken = require('../../middlewares/verifyServiceToken');

router.post('/forgot-password', serviceUserController.sendForgotPasswordMail);
router.post('/reset-password', serviceUserController.resetPassword);

// router.use(verifyToken);

// router.post('/', checkRole(['Super Admin', 'Admin']), serviceUserController.create);
// router.get(
// 	'/profile',
// 	checkRole(['Super Admin', 'Admin', 'Vendor']),
// 	serviceUserController.getUserProfileById
// );
router.put(
	'/profile/:swayamm_user_id',
	// checkRole(['Super Admin', 'Admin', 'Vendor']),
	verifyServiceToken,
	uploadTo('uploads/profile').fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'logo', maxCount: 1 },
	]),
	serviceUserController.updateUserProfile
);
router.put('/:id', checkRole(['Super Admin', 'Admin']), serviceUserController.update);
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	serviceUserController.destroy
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin']),
	serviceUserController.getAllUsers
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin']),
	serviceUserController.getUserById
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
	serviceUserController.getTechSupportUsers
);

module.exports = router;
