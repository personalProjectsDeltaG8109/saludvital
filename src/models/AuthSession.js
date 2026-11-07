import { DataTypes } from "sequelize";
import database from "../../config/database.js";

// Store a one-way hash of the JWT session identifier, never the raw identifier.
const AuthSession = database.define(
    "AuthSession",
    {
        session_id_hash: {
            type: DataTypes.STRING(64),
            allowNull: false,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        last_activity_at: {
            type: DataTypes.DATE(3),
            allowNull: false,
        },
    },
    {
        tableName: "auth_sessions",
        freezeTableName: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: false,
    },
);

export default AuthSession;
