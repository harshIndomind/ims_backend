const { MasterPlaceOfUse } = require('../models/index');

exports.create = (data, options = {}) => {
    return MasterPlaceOfUse.create(data, options);
};

exports.findById = (id, options = {}) => {
    return MasterPlaceOfUse.findByPk(id, options);
};

exports.findOne = (options = {}) => {
    return MasterPlaceOfUse.findOne(options);
};

exports.findAll = (where = {}, options = {}) => {
    return MasterPlaceOfUse.findAndCountAll({
        where,
        ...options,
    });
};

exports.update = (instance, data, options = {}) => {
    return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
    return instance.destroy(options);
};