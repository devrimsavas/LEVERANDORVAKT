import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { SALT_ROUNDS } from "../services/authService.js";

const MIN_ADMIN_PASSWORD_LENGTH = 8;

// Creates the admin account from environment variables on startup.
// Runs on every start but only creates the admin once: if any admin
// already exists, it does nothing.
export async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME;
  const lastName = process.env.ADMIN_LAST_NAME;

  if (!email || !password || !firstName || !lastName) {
    console.warn("Admin: skipped, ADMIN_* environment variables are not set");
    return;
  }

  const existingAdmin = await User.findOne({ where: { role: "admin" } });
  if (existingAdmin) {
    console.log("Admin: already exists");
    return;
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    console.warn(
      `Admin: skipped, ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`,
    );
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Never promote an existing normal user to admin automatically
  const emailTaken = await User.findOne({ where: { email: normalizedEmail } });
  if (emailTaken) {
    console.warn(
      `Admin: skipped, ${normalizedEmail} is already registered as a normal user`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "admin",
  });

  console.log(`Admin: created ${normalizedEmail}`);
}
