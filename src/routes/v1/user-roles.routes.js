'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../../middlewares/verifyToken')
const userRoleController = require('../../controllers/user-roles.controller');

router.use(verifyToken);

// 🔹 Assign roles to user
router.post(
	'/',
	userRoleController.createUserRoles
);

// 🔹 Update roles of a user
router.put(
	'/:user_id',
	userRoleController.updateUserRoles
);

// 🔹 Get roles of a single user
router.get(
	'/:user_id',
	userRoleController.getUserRoles
);

// 🔹 Get all users with their roles
router.get(
	'/',
	userRoleController.getAllUserRoles
);

module.exports = router;
