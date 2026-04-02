const { MasterMajorHead } = require('../models/index');

exports.create = (data, options = {}) => {
	return MasterMajorHead.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterMajorHead.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	try {
		console.log("where ", where);
		
		return MasterMajorHead.findAndCountAll({
			where,
			...options,
		});
	} catch (error) {
		console.error('Error fetching Master Major Heads:', error);
		throw error;
	}
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};
