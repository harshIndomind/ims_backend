const express = require('express')
const router = express.Router();
const AuthController = require('../../controllers/auth.controller');
const verifyToken = require('../../middlewares/verifyToken');


router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.get('/logout', AuthController.logout);
router.get('/me', verifyToken, AuthController.getLoggedInUser);

module.exports = router;