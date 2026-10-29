"use strict";

const DEFAULT_FLOW_NAME = "SaludVital - Citas por WhatsApp";
const DEFAULT_FLOW = {
    startStepId: "welcome",
    steps: [
        {
            id: "welcome",
            type: "message",
            text: "Hola. Soy el asistente de SaludVital.",
            nextStepId: "menu",
        },
        {
            id: "menu",
            type: "question",
            text: "Elige una opción:",
            options: [
                { label: "Solicitar cita", nextStepId: "booking" },
                { label: "Consultar citas", nextStepId: "appointments" },
                { label: "Reprogramar cita", nextStepId: "reschedule" },
                { label: "Cancelar cita", nextStepId: "cancel" },
            ],
        },
        { id: "booking", type: "message", text: "Solicitar una cita", nextStepId: null },
        { id: "appointments", type: "message", text: "Consultar citas", nextStepId: null },
        { id: "reschedule", type: "message", text: "Reprogramar una cita", nextStepId: null },
        { id: "cancel", type: "message", text: "Cancelar una cita", nextStepId: null },
    ],
};

export async function up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.addColumn(
            "whatsapp_conversations",
            "wa_contact_id",
            { type: Sequelize.STRING(32), allowNull: true },
            { transaction },
        );
        await queryInterface.addColumn(
            "whatsapp_conversations",
            "chatbot_state",
            { type: Sequelize.JSON, allowNull: true },
            { transaction },
        );
        await queryInterface.addColumn(
            "whatsapp_conversations",
            "identity_verified_until",
            { type: Sequelize.DATE, allowNull: true },
            { transaction },
        );
        await queryInterface.addColumn(
            "whatsapp_conversations",
            "identity_code_sent_at",
            { type: Sequelize.DATE, allowNull: true },
            { transaction },
        );
        await queryInterface.addColumn(
            "whatsapp_conversations",
            "chatbot_flow_version_id",
            {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true,
                references: { model: "chatbot_flow_versions", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            { transaction },
        );
        await queryInterface.addIndex(
            "whatsapp_conversations",
            ["provider_name", "provider_account_id", "wa_contact_id"],
            { unique: true, name: "whatsapp_conversations_contact_scope_unique", transaction },
        );
        await queryInterface.sequelize.query(
            "UPDATE whatsapp_messages SET content_expires_at = DATE_ADD(created_at, INTERVAL 30 DAY) WHERE content IS NOT NULL AND content_expires_at IS NULL",
            { transaction },
        );
        await queryInterface.addColumn(
            "notifications",
            "provider_delivery_status",
            { type: Sequelize.STRING(30), allowNull: true },
            { transaction },
        );

        await queryInterface.changeColumn(
            "chatbot_flow_versions",
            "status",
            {
                type: Sequelize.ENUM("Draft", "Published", "Archived"),
                allowNull: false,
                defaultValue: "Draft",
            },
            { transaction },
        );
        await queryInterface.sequelize.query(
            "ALTER TABLE chatbot_flow_versions MODIFY created_by INT UNSIGNED NULL",
            { transaction },
        );

        await queryInterface.createTable(
            "whatsapp_chatbot_runtime_settings",
            {
                id: { type: Sequelize.TINYINT.UNSIGNED, primaryKey: true, allowNull: false },
                active_flow_version_id: {
                    type: Sequelize.INTEGER.UNSIGNED,
                    allowNull: true,
                    references: { model: "chatbot_flow_versions", key: "id" },
                    onUpdate: "CASCADE",
                    onDelete: "RESTRICT",
                },
                updated_at: { type: Sequelize.DATE, allowNull: false },
            },
            { transaction },
        );

        await queryInterface.bulkInsert(
            "chatbot_flows",
            [{ created_at: new Date(), updated_at: new Date() }],
            { transaction },
        );
        const [flowRows] = await queryInterface.sequelize.query(
            "SELECT id FROM chatbot_flows ORDER BY id DESC LIMIT 1",
            { transaction },
        );
        const flowId = flowRows[0].id;
        await queryInterface.bulkInsert(
            "chatbot_flow_versions",
            [
                {
                    flow_id: flowId,
                    version_number: 1,
                    name: DEFAULT_FLOW_NAME,
                    description: "Flujo inicial de atención de citas por WhatsApp.",
                    status: "Published",
                    definition: JSON.stringify(DEFAULT_FLOW),
                    created_by: null,
                    created_at: new Date(),
                },
            ],
            { transaction },
        );
        const [versionRows] = await queryInterface.sequelize.query(
            "SELECT id FROM chatbot_flow_versions WHERE flow_id = :flowId AND version_number = 1",
            { replacements: { flowId }, transaction },
        );
        await queryInterface.bulkInsert(
            "whatsapp_chatbot_runtime_settings",
            [{ id: 1, active_flow_version_id: versionRows[0].id, updated_at: new Date() }],
            { transaction },
        );
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

export async function down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
        await queryInterface.dropTable("whatsapp_chatbot_runtime_settings", { transaction });
        const [seededVersions] = await queryInterface.sequelize.query(
            "SELECT id, flow_id FROM chatbot_flow_versions WHERE name = :name AND created_by IS NULL AND version_number = 1",
            { replacements: { name: DEFAULT_FLOW_NAME }, transaction },
        );
        for (const version of seededVersions) {
            await queryInterface.bulkDelete(
                "chatbot_flow_versions",
                { id: version.id },
                { transaction },
            );
            const [remainingVersions] = await queryInterface.sequelize.query(
                "SELECT id FROM chatbot_flow_versions WHERE flow_id = :flowId LIMIT 1",
                { replacements: { flowId: version.flow_id }, transaction },
            );
            if (!remainingVersions.length) {
                await queryInterface.bulkDelete(
                    "chatbot_flows",
                    { id: version.flow_id },
                    { transaction },
                );
            }
        }
        await queryInterface.sequelize.query(
            "ALTER TABLE chatbot_flow_versions MODIFY created_by INT UNSIGNED NOT NULL",
            { transaction },
        );
        await queryInterface.changeColumn(
            "chatbot_flow_versions",
            "status",
            { type: Sequelize.ENUM("Draft"), allowNull: false, defaultValue: "Draft" },
            { transaction },
        );
        await queryInterface.removeIndex(
            "whatsapp_conversations",
            "whatsapp_conversations_contact_scope_unique",
            { transaction },
        );
        await queryInterface.removeColumn("whatsapp_conversations", "identity_verified_until", {
            transaction,
        });
        await queryInterface.removeColumn("whatsapp_conversations", "identity_code_sent_at", {
            transaction,
        });
        await queryInterface.removeColumn("whatsapp_conversations", "chatbot_state", {
            transaction,
        });
        await queryInterface.removeColumn("whatsapp_conversations", "wa_contact_id", {
            transaction,
        });
        await queryInterface.removeColumn("whatsapp_conversations", "chatbot_flow_version_id", {
            transaction,
        });
        await queryInterface.removeColumn("notifications", "provider_delivery_status", {
            transaction,
        });
        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}
