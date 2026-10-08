const express = require('express');
const router = express.Router();
const AuthController = require('../../controllers/auth.controller');
const verifyToken = require('../../middlewares/verifyToken');
const { loginLimiter } = require('../../middlewares/rateLimiter');

// Public self-registration disabled: it let anyone create users. Re-enable
// behind verifyToken + a super-admin check if IMS needs it.
// router.post('/register', AuthController.register);
router.post('/login', loginLimiter, AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.get('/logout', AuthController.logout);
router.get('/me', verifyToken, AuthController.getLoggedInUser);

module.exports = router;