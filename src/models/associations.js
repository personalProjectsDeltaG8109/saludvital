
import Rol from "./Rol.js";
import Usuario from "./User.js";
import Patient from "./Patient.js";
import Doctor from "./Doctor.js";
import Specialities from "./Specialities.js";

// Associate each role with its user accounts.
Rol.hasMany(Usuario, {
    foreignKey: "role_id",
    as: "usuarios",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Usuario.belongsTo(Rol, {
    foreignKey: "role_id",
    as: "rol",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their patient profiles.
Usuario.hasOne(Patient, {
    foreignKey: "user_id",
    as: "patient",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Patient.belongsTo(Usuario, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate user accounts with their doctor profiles.
Usuario.hasOne(Doctor, {
    foreignKey: "user_id",
    as: "doctor",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.belongsTo(Usuario, {
    foreignKey: "user_id",
    as: "user",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Associate each medical specialty with its doctors.
Specialities.hasMany(Doctor, {
    foreignKey: "specialty_id",
    as: "doctors",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

Doctor.belongsTo(Specialities, {
    foreignKey: "specialty_id",
    as: "specialty",
    onUpdate: "CASCADE",
    onDelete: "RESTRICT",
});

// Export the models after registering their associations.
export { Rol, Usuario, Patient, Doctor, Specialities };
