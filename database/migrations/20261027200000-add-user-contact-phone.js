"use strict";

import { DataTypes } from "sequelize";

export async function up(queryInterface) {
    await queryInterface.addColumn("users", "phone", {
        type: DataTypes.STRING(20),
        allowNull: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("users", "phone");
}
