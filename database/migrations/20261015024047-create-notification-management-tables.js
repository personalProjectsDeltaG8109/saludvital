
'use strict';

/**
 * Creates notification preferences and notification delivery records.
 * These tables support patient communication through Email, SMS and WhatsApp.
 */

export async function up(queryInterface, Sequelize) {
  // Create patient notification preferences.
  await queryInterface.createTable('notification_preferences', {
    id: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    patient_id: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'patients',
        key: 'id',
      },
      // Preserve preferences while the referenced patient exists.
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    channel: {
      type: Sequelize.ENUM('Email', 'SMS', 'WhatsApp'),
      allowNull: false,
    },
    event_type: {
      type: Sequelize.STRING(50),
      allowNull: false,
    },
    is_enabled: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      // Sequelize.DATE maps to DATETIME in MySQL.
      // Application code must store and interpret timestamps consistently in UTC.
      type: Sequelize.DATE,
      allowNull: false,
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
  });

  // A patient can have only one preference per channel and event type.
  await queryInterface.addConstraint('notification_preferences', {
    fields: ['patient_id', 'channel', 'event_type'],
    type: 'unique',
    name: 'notification_preferences_patient_channel_event_unique',
  });

  // Create the notification delivery history.
  await queryInterface.createTable('notifications', {
    id: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    patient_id: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'patients',
        key: 'id',
      },
      // Prevent deletion of a patient while notification history references them.
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    appointment_id: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'appointments',
        key: 'id',
      },
      // Preserve notification history if its related appointment is removed.
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    channel: {
      type: Sequelize.ENUM('Email', 'SMS', 'WhatsApp'),
      allowNull: false,
    },
    recipient_address: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    event_type: {
      type: Sequelize.STRING(50),
      allowNull: false,
    },
    status: {
      type: Sequelize.ENUM(
        'Pending',
        'Processing',
        'Sent',
        'Failed',
        'Cancelled',
      ),
      allowNull: false,
      defaultValue: 'Pending',
    },
    scheduled_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    sent_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    attempt_count: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    provider_message_id: {
      type: Sequelize.STRING(191),
      allowNull: true,
    },
    last_error: {
      // Store sanitized technical details only; never secrets or clinical data.
      type: Sequelize.TEXT,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
  });

  // Add indexes for common patient, appointment and queue lookups.
  await queryInterface.addIndex('notifications', ['patient_id'], {
    name: 'notifications_patient_id_index',
  });

  await queryInterface.addIndex('notifications', ['appointment_id'], {
    name: 'notifications_appointment_id_index',
  });

  await queryInterface.addIndex('notifications', ['status', 'scheduled_at'], {
    name: 'notifications_status_scheduled_at_index',
  });
}

export async function down(queryInterface) {
  // Drop dependent notification records before their preference table.
  await queryInterface.dropTable('notifications');
  await queryInterface.dropTable('notification_preferences');
}
