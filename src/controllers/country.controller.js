const { Country } = require('../models');
const { Op } = require('sequelize');
// Create
exports.createTax = async (req, res) => {
	try {
		const tax = await Tax.create(req.body);
		res.status(201).json(tax);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Get all
exports.getAllCountries = async (req, res) => {
	try {
		const search = req.query.search || '';

		let whereClause = {};
		if (search) {
			whereClause = {
				name: {
					[Op.like]: `%${search}%`, // case-insensitive search
				},
			};
		}

		const countries = await Country.findAll({
			where: whereClause,
			order: [['name', 'ASC']],
		});
		res.json(countries);
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: err.message });
	}
};

// Get one
exports.getTaxById = async (req, res) => {
	try {
		const tax = await Tax.findByPk(req.params.id);
		if (!tax) return res.status(404).json({ message: 'Tax not found' });
		res.json(tax);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Update
exports.updateTax = async (req, res) => {
	try {
		const tax = await Tax.findByPk(req.params.id);
		if (!tax) return res.status(404).json({ message: 'Tax not found' });

		await tax.update(req.body);
		res.json(tax);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// Delete
exports.deleteTax = async (req, res) => {
	try {
		const tax = await Tax.findByPk(req.params.id);
		if (!tax) return res.status(404).json({ message: 'Tax not found' });

		await tax.destroy();
		res.json({ message: 'Tax deleted successfully' });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
