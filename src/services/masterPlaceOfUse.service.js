const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterPlaceOfUseRepository } = require('../repository/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

exports.createPlaceOfUse = async (payload) => {
    const { code, name, short_name } = payload;

    if (!code || !name || !short_name) {
        logger.warn('Validation failed while creating Place of Use', payload);
        throw new AppError('Code, name and short name are required', StatusCodes.BAD_REQUEST);
    }

  
    if (!/^[a-zA-Z0-9]+$/.test(short_name)) {
        throw new AppError('Short name must be alphanumeric only', StatusCodes.BAD_REQUEST);
    }

    
    const existing = await masterPlaceOfUseRepository.findOne({
        where: { code },
    });
    if (existing) {
        throw new AppError('Code already exists', StatusCodes.CONFLICT);
    }

    const placeOfUse = await masterPlaceOfUseRepository.create({
        code,
        name,
        short_name,
    });

    logger.info('Place of Use created', { id: placeOfUse.id });
    return placeOfUse;
};

exports.updatePlaceOfUse = async (id, payload) => {
    const { code, name, short_name } = payload;

    if (!code || !name || !short_name) {
        throw new AppError('Code, name and short name are required', StatusCodes.BAD_REQUEST);
    }

    if (!/^[a-zA-Z0-9]+$/.test(short_name)) {
        throw new AppError('Short name must be alphanumeric only', StatusCodes.BAD_REQUEST);
    }

    const placeOfUse = await masterPlaceOfUseRepository.findById(id);
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }

    
    const duplicate = await masterPlaceOfUseRepository.findOne({
        where: { code, id: { [Op.ne]: id } },
    });
    if (duplicate) {
        throw new AppError('Code already exists', StatusCodes.CONFLICT);
    }

    await masterPlaceOfUseRepository.update(placeOfUse, { code, name, short_name });

    logger.info('Place of Use updated', { id });
    return placeOfUse;
};

exports.getAllPlaceOfUse = async (req) => {
    const { limit, offset, search } = req.query;

    const where = {
        name: { [Op.like]: `%${search || ''}%` },
    };

    const filterOptions = { where };

    if (limit) {
        filterOptions.limit = Number(limit);
        filterOptions.offset = Number(offset || 0);
    }

    logger.info('Fetching all Place of Use');
    return await masterPlaceOfUseRepository.findAll({}, filterOptions);
};

exports.getPlaceOfUseById = async (id) => {
    const placeOfUse = await masterPlaceOfUseRepository.findById(id);
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
    logger.info('Place of Use fetched', { id });
    return placeOfUse;
};

exports.deletePlaceOfUse = async (id) => {
    const placeOfUse = await masterPlaceOfUseRepository.findById(id);
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
    await masterPlaceOfUseRepository.delete(placeOfUse);
    logger.info('Place of Use deleted', { id });
    return true;
};