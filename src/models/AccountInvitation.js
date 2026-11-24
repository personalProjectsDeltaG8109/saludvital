import database from "../../config/database.js";
import { DataTypes } from "sequelize";

const AccountInvitation = database.define(
    "AccountInvitation",
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
        },
        invited_by_user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        token_hash: {
            type: DataTypes.STRING(64),
            allowNull: true,
            unique: true,
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        cancelled_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "account_invitations",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    },
);

export default AccountInvitation;
