import { jest, describe, test, expect } from "@jest/globals";

// Mock model definitions to prevent real database operations.
jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        define: jest.fn((modelName, attributes, options) => ({
            modelName,
            rawAttributes: attributes,
            options,
            associations: {},

            // Register simulated one-to-many associations.
            hasMany(target, associationOptions) {
                this.associations[associationOptions.as] = {
                    associationType: "HasMany",
                    target,
                    foreignKey: associationOptions.foreignKey,
                };
            },

            // Register simulated one-to-one associations.
            hasOne(target, associationOptions) {
                this.associations[associationOptions.as] = {
                    associationType: "HasOne",
                    target,
                    foreignKey: associationOptions.foreignKey,
                };
            },

            // Register simulated many-to-one associations.
            belongsTo(target, associationOptions) {
                this.associations[associationOptions.as] = {
                    associationType: "BelongsTo",
                    target,
                    foreignKey: associationOptions.foreignKey,
                };
            },
        })),
    },
}));

// Import the existing models after registering the database mock.
const { default: Rol } = await import("../../src/models/Rol.js");
const { default: User } = await import("../../src/models/User.js");
const { default: Patient } = await import("../../src/models/Patient.js");
const { default: Doctor } = await import("../../src/models/Doctor.js");
const { default: Specialities } = await import("../../src/models/Specialities.js");

// Register the model associations.
await import("../../src/models/associations.js");

describe("Sequelize model definitions", () => {
    test("role model maps to the roles table", () => {
        expect(Rol.options.tableName).toBe("roles");
        expect(Rol.rawAttributes.name.allowNull).toBe(false);
    });

    test("user model maps to the users table", () => {
        expect(User.options.tableName).toBe("users");
        expect(User.rawAttributes.role_id.allowNull).toBe(false);
        expect(User.rawAttributes.email.unique).toBe(true);
    });

    test("patient model maps to the patients table", () => {
        expect(Patient.options.tableName).toBe("patients");
        expect(Patient.rawAttributes.user_id.allowNull).toBe(true);
        expect(Patient.rawAttributes.first_name.allowNull).toBe(false);
        expect(Patient.rawAttributes.date_of_birth.type.key).toBe("DATEONLY");
        expect(Patient.rawAttributes.allergies.allowNull).toBe(true);
    });

    test("doctor model maps to the doctors table", () => {
        expect(Doctor.options.tableName).toBe("doctors");
        expect(Doctor.rawAttributes.user_id.allowNull).toBe(false);
        expect(Doctor.rawAttributes.specialty_id.allowNull).toBe(false);
        expect(Doctor.rawAttributes.professional_information.allowNull).toBe(true);
    });

    test("specialty model maps to the specialties table", () => {
        expect(Specialities.options.tableName).toBe("specialties");
        expect(Specialities.rawAttributes.name.unique).toBe(true);
        expect(Specialities.rawAttributes.is_active.defaultValue).toBe(true);
    });

    test("all models use the existing timestamp column names", () => {
        for (const model of [Rol, User, Patient, Doctor, Specialities]) {
            expect(model.options.timestamps).toBe(true);
            expect(model.options.createdAt).toBe("created_at");
            expect(model.options.updatedAt).toBe("updated_at");
        }
    });
});

describe("Model associations", () => {
    test("roles and users are associated", () => {
        expect(Rol.associations.usuarios.target).toBe(User);
        expect(User.associations.rol.target).toBe(Rol);
    });

    test("users and patients are associated", () => {
        expect(User.associations.patient.target).toBe(Patient);
        expect(User.associations.patient.foreignKey).toBe("user_id");
        expect(Patient.associations.user.target).toBe(User);
    });

    test("users and doctors are associated", () => {
        expect(User.associations.doctor.target).toBe(Doctor);
        expect(Doctor.associations.user.target).toBe(User);
    });

    test("specialties and doctors are associated", () => {
        expect(Specialities.associations.doctors.target).toBe(Doctor);
        expect(Doctor.associations.specialty.target).toBe(Specialities);
        expect(Doctor.associations.specialty.foreignKey).toBe("specialty_id");
    });
});
