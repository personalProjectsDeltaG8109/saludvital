"use strict";

import { DataTypes } from "sequelize";

export async function up(queryInterface) {
    await queryInterface.addColumn("users", "display_name", {
        type: DataTypes.STRING(120),
        allowNull: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("users", "display_name");
}
