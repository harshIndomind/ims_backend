const router = require('express').Router();
const Notification = require('../../controllers/notification.controller');
const verifyToken = require('../../middlewares/verifyToken');

router.use(verifyToken);
console.log("notification routes....");

router.get(
	'/:id',
	Notification.getUnreadNotifications
);

router.patch(
	'/:alertId/read',
	Notification.markNotificationAsRead
);
console.log("notification routes 1....");

module.exports = router;
