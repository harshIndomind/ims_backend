const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const masterPlaceOfUseService = require('../services/masterPlaceOfUse.service');

exports.createPlaceOfUse = catchAsync(async (req, res) => {
    const data = await masterPlaceOfUseService.createPlaceOfUse(req, req.body);
    res.status(StatusCodes.CREATED).json({
        message: 'Place of Use created successfully',
        data,
    });
});

exports.updatePlaceOfUse = catchAsync(async (req, res) => {
    const { id } = req.params;
    const data = await masterPlaceOfUseService.updatePlaceOfUse(req, id, req.body);
    res.status(StatusCodes.OK).json({
        message: 'Place of Use updated successfully',
        data,
    });
});

exports.getAllPlaceOfUse = catchAsync(async (req, res) => {
    const data = await masterPlaceOfUseService.getAllPlaceOfUse(req);
    res.status(StatusCodes.OK).json({ data });
});

exports.getPlaceOfUseById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const data = await masterPlaceOfUseService.getPlaceOfUseById(req, id);
    res.status(StatusCodes.OK).json({
        message: 'Place of Use fetched successfully',
        data,
    });
});

exports.deletePlaceOfUse = catchAsync(async (req, res) => {
    const { id } = req.params;
    await masterPlaceOfUseService.deletePlaceOfUse(req, id);
    res.status(StatusCodes.OK).json({
        message: 'Place of Use deleted successfully',
    });
});