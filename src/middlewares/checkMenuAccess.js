// middlewares/checkMenuAccess.js
const { Role, Menu } = require('../models');

module.exports = async function checkMenuAccess(req, res, next) {
	try {
		const roleId = req.user.roleId; // assuming role is attached to req.user
		const urlPath = req.path;

		const role = await Role.findByPk(roleId, {
			include: {
				model: Menu,
				as: 'menus',
				attributes: ['url'],
				through: { attributes: [] },
			},
		});

		const allowedUrls = role.menus.map((menu) => menu.url).filter(Boolean);

		if (!allowedUrls.includes(urlPath)) {
			return res.status(403).json({ message: 'Access Denied: Unauthorized Menu' });
		}

		next();
	} catch (error) {
		console.error('Menu access check failed', error);
		return res.status(500).json({ message: 'Internal Server Error' });
	}
};
