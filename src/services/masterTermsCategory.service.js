const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterTermCategoryRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.createTermCategory = async (payload) => {
	const { category_name, category_code, description } = payload;

	if (!category_name) {
		logger.warn('Validation failed while creating Term Category', payload);
		throw new AppError('Category name is required', StatusCodes.BAD_REQUEST);
	}

	// Check duplicate category name
	const existing = await masterTermCategoryRepository.findOne({
		where: { category_name },
	});

	if (existing) {
		logger.warn('Term Category already exists', { category_name });
		throw new AppError('Category name already exists', StatusCodes.CONFLICT);
	}

	const termCategory = await masterTermCategoryRepository.create({
		category_name,
		category_code: category_code || null,
		description: description || null,
		is_active: true,
	});

	logger.info('Term Category created', { id: termCategory.id });

	return termCategory;
};

exports.updateTermCategory = async (id, payload) => {
	const { category_name, category_code, description } = payload;

	if (!category_name) {
		logger.warn('Validation failed while updating Term Category', payload);
		throw new AppError('Category name is required', StatusCodes.BAD_REQUEST);
	}

	const termCategory = await masterTermCategoryRepository.findById(id);

	if (!termCategory) {
		logger.warn('Term Category not found for update', { id });
		throw new AppError('Term Category not found', StatusCodes.NOT_FOUND);
	}

	// Check duplicate name but exclude current record
	const duplicate = await masterTermCategoryRepository.findOne({
		where: {
			category_name,
			id: { [Op.ne]: id },  // exclude current id
		},
	});

	if (duplicate) {
		logger.warn('Term Category name already exists', { category_name });
		throw new AppError('Category name already exists', StatusCodes.CONFLICT);
	}

	await masterTermCategoryRepository.update(termCategory, {
		category_name,
		category_code: category_code || null,
		description: description || null,
	});

	logger.info('Term Category updated', { id });

	return termCategory;
};

exports.getAllTermCategories = async (req) => {
	const { limit, offset, search } = req.query;

	const where = {
		category_name: {
			[Op.like]: `%${search || ''}%`,
		},
	};

	const filterOptions = { where };

	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	logger.info('Fetching all Term Categories', { filterOptions });
	return await masterTermCategoryRepository.findAll({}, filterOptions);
};

exports.getTermCategoryById = async (id) => {
	const termCategory = await masterTermCategoryRepository.findById(id);

	if (!termCategory) {
		logger.warn('Term Category not found', { id });
		throw new AppError('Term Category not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Term Category fetched', { id });

	return termCategory;
};

exports.deleteTermCategory = async (id) => {
	const termCategory = await masterTermCategoryRepository.findById(id);

	if (!termCategory) {
		logger.warn('Term Category not found for delete', { id });
		throw new AppError('Term Category not found', StatusCodes.NOT_FOUND);
	}

	await masterTermCategoryRepository.delete(termCategory);

	logger.info('Term Category deleted', { id });

	return true;
};

exports.toggleTermCategoryStatus = async (id) => {
	const termCategory = await masterTermCategoryRepository.findById(id);

	if (!termCategory) {
		logger.warn('Term Category not found for toggle', { id });
		throw new AppError('Term Category not found', StatusCodes.NOT_FOUND);
	}

	const newStatus = !termCategory.is_active;

	await masterTermCategoryRepository.update(termCategory, {
		is_active: newStatus,
	});

	logger.info('Term Category status toggled', { id, is_active: newStatus });

	return termCategory;
};

exports.getActiveTermCategories = async () => {
	logger.info('Fetching active Term Categories for dropdown');

	return await masterTermCategoryRepository.findAll(
		{},
		{
			where: { is_active: true },
			attributes: ['id', 'category_name', 'category_code', 'description'],
			order: [['category_name', 'ASC']],
		}
	);
};