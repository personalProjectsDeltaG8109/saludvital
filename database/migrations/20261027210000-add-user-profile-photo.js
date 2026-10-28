"use strict";

import { DataTypes } from "sequelize";

export async function up(queryInterface) {
    await queryInterface.addColumn("users", "profile_photo_url", {
        type: DataTypes.STRING(255),
        allowNull: true,
    });
}

export async function down(queryInterface) {
    await queryInterface.removeColumn("users", "profile_photo_url");
}
