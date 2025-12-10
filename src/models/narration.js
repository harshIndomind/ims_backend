'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
	class Narration extends Model {
		/**
		 * Helper method for defining associations.
		 * This method is not a part of Sequelize lifecycle.
		 * The `models/index` file will call this method automatically.
		 */
		static associate(models) {}
	}

	Narration.init(
		{
			NARR_CODE: { type: DataTypes.STRING(15), primaryKey: true },
			D_AC_CODE: DataTypes.STRING(7),
			D_AC_TEXT: DataTypes.STRING(60),
			C_AC_CODE: DataTypes.STRING(7),
			C_AC_TEXT: DataTypes.STRING(60),
			P_L_CODE: DataTypes.STRING(20),
			P_L_TEXT: DataTypes.STRING(100),
			P_LCR_CODE: DataTypes.STRING(20),
			P_LCR_TEXT: DataTypes.STRING(100),
			B_SH_CODE: DataTypes.STRING(20),
			B_SH_TEXT: DataTypes.STRING(100),
			B_SHCR_CODE: DataTypes.STRING(20),
			B_SHCR_TEXT: DataTypes.STRING(100),
			C_F_CODE: DataTypes.STRING(20),
			C_F_TEXT: DataTypes.STRING(100),
			C_FCR_CODE: DataTypes.STRING(20),
			C_FCR_TEXT: DataTypes.STRING(100),
			LDG_CODE: DataTypes.STRING(2),
			LDG_TEXT: DataTypes.STRING(40),
			LDGCR_CODE: DataTypes.STRING(2),
			LDGCR_TEXT: DataTypes.STRING(40),
			VT_CODE: DataTypes.STRING(2),
			VT_TEXT: DataTypes.STRING(35),
			MISC_DB_CODE: DataTypes.STRING(20),
			MISC_DB_TEXT: DataTypes.STRING(100),
			MISC_CR_CODE: DataTypes.STRING(20),
			MISC_CR_TEXT: DataTypes.STRING(100),
			BOOK: DataTypes.STRING(20),
			VARR1: DataTypes.STRING(100),
			VARR2: DataTypes.STRING(100),
			VARR3: DataTypes.STRING(100),
			VARR4: DataTypes.STRING(100),
			VARR5: DataTypes.STRING(100),
			VARR6: DataTypes.STRING(100),
			VARR7: DataTypes.STRING(100),
			VARR8: DataTypes.STRING(100),
			VARR9: DataTypes.STRING(100),
			VARR10: DataTypes.STRING(100),
			VARR11: DataTypes.STRING(100),
			VARR12: DataTypes.STRING(100),
			VARR13: DataTypes.STRING(100),
			VARR14: DataTypes.STRING(100),
			VARR15: DataTypes.STRING(100),
			VARR16: DataTypes.STRING(100),
			VARR17: DataTypes.STRING(100),
			VARR18: DataTypes.STRING(100),
			PAY_OPT: DataTypes.STRING(30),
			D_O_OPENING: DataTypes.DATE,
			RESP_PERSON: DataTypes.STRING(5),
			TT_CODE: DataTypes.INTEGER,
		},
		{
			sequelize,
			modelName: 'Narration',
		}
	);

	return Narration;
};
