const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { masterPlaceOfUseRepository } = require('../repository/index');
const { organization, Indent } = require('../models/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

const ORG_INCLUDE = [{ model: organization, as: 'organization', attributes: ['id', 'org_name'] }];

function assertOrgAccess(req, placeOfUse) {
    if (req.user.isSuperAdmin) return;
    if (placeOfUse.org_id !== req.user.org_id) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
}

async function assertNotInUse(id, action) {
    const indentCount = await Indent.count({ where: { place_of_use_id: id } });
    if (indentCount > 0) {
        throw new AppError(
            `Cannot ${action} Place of Use: it is referenced by ${indentCount} indent(s)`,
            StatusCodes.CONFLICT,
        );
    }
}

const CODE_MAX_LENGTH = 50;
const NAME_MAX_LENGTH = 255;
const SHORT_NAME_MAX_LENGTH = 20;

// Escape LIKE wildcards so user-supplied search text is matched literally.
const escapeLike = (value) => value.replace(/[%_\\]/g, (char) => `\\${char}`);

function sanitizePayload(payload) {
    const code = typeof payload.code === 'string' ? payload.code.trim() : payload.code;
    const name = typeof payload.name === 'string' ? payload.name.trim() : payload.name;
    const short_name =
        typeof payload.short_name === 'string' ? payload.short_name.trim() : payload.short_name;

    if (!code || !name || !short_name) {
        throw new AppError('Code, name and short name are required', StatusCodes.BAD_REQUEST);
    }

    if (code.length > CODE_MAX_LENGTH) {
        throw new AppError(`Code must not exceed ${CODE_MAX_LENGTH} characters`, StatusCodes.BAD_REQUEST);
    }

    if (name.length > NAME_MAX_LENGTH) {
        throw new AppError(`Name must not exceed ${NAME_MAX_LENGTH} characters`, StatusCodes.BAD_REQUEST);
    }

    if (short_name.length > SHORT_NAME_MAX_LENGTH) {
        throw new AppError(
            `Short name must not exceed ${SHORT_NAME_MAX_LENGTH} characters`,
            StatusCodes.BAD_REQUEST,
        );
    }

    if (!/^[a-zA-Z0-9]+$/.test(short_name)) {
        throw new AppError('Short name must be alphanumeric only', StatusCodes.BAD_REQUEST);
    }

    return { code, name, short_name };
}

exports.createPlaceOfUse = async (req, payload) => {
    const { code, name, short_name } = sanitizePayload(payload);
    const { org_id } = req.user;

    const existing = await masterPlaceOfUseRepository.findOne({
        where: { code },
    });
    if (existing) {
        throw new AppError('Code already exists', StatusCodes.CONFLICT);
    }

    const placeOfUse = await masterPlaceOfUseRepository.create({
        org_id,
        code,
        name,
        short_name,
    });

    logger.info('Place of Use created', { id: placeOfUse.id, org_id });
    return placeOfUse;
};

exports.updatePlaceOfUse = async (req, id, payload) => {
    const { code, name, short_name } = sanitizePayload(payload);

    const placeOfUse = await masterPlaceOfUseRepository.findById(id);
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
    assertOrgAccess(req, placeOfUse);
    await assertNotInUse(id, 'update');

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
    const { org_id, isSuperAdmin } = req.user;
    const { limit, offset, search, org_id: filterOrgId } = req.query;

    const where = {
        // Super admins may browse across organizations via the org dropdown;
        // everyone else stays locked to their own organization.
        ...(isSuperAdmin ? filterOrgId && { org_id: Number(filterOrgId) } : { org_id }),
    };

    if (search && typeof search === 'string' && search.trim()) {
        const term = `%${escapeLike(search.trim())}%`;
        where[Op.or] = [
            { code: { [Op.like]: term } },
            { name: { [Op.like]: term } },
            { short_name: { [Op.like]: term } },
        ];
    }

    const filterOptions = { where, include: ORG_INCLUDE };

    if (limit) {
        filterOptions.limit = Number(limit);
        filterOptions.offset = Number(offset || 0);
    }

    logger.info('Fetching all Place of Use');
    return await masterPlaceOfUseRepository.findAll({}, filterOptions);
};

exports.getPlaceOfUseById = async (req, id) => {
    const placeOfUse = await masterPlaceOfUseRepository.findById(id, { include: ORG_INCLUDE });
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
    assertOrgAccess(req, placeOfUse);
    logger.info('Place of Use fetched', { id });
    return placeOfUse;
};

exports.deletePlaceOfUse = async (req, id) => {
    const placeOfUse = await masterPlaceOfUseRepository.findById(id);
    if (!placeOfUse) {
        throw new AppError('Place of Use not found', StatusCodes.NOT_FOUND);
    }
    assertOrgAccess(req, placeOfUse);
    await assertNotInUse(id, 'delete');
    await masterPlaceOfUseRepository.delete(placeOfUse);
    logger.info('Place of Use deleted', { id });
    return true;
};