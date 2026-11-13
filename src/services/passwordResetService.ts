import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../config/database.js";
import { User } from "../models/User.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { normalizeEmail, SALT_ROUNDS } from "./authService.js";
import { getEmailSender } from "./email/emailSender.js";
import { passwordResetEmail, type EmailLanguage } from "./email/templates.js";

// How long a reset link works
export const RESET_LINK_MINUTES = 60;

export class InvalidResetTokenError extends Error {}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Where the web app runs, for the link in the email
function webAppUrl(): string {
  return (process.env.WEB_APP_URL || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );
}

// Sends a reset link if an account has this email. Does nothing for an
// unknown email; the caller answers the same either way, so the form
// cannot be used to find out who has an account. A new link replaces any
// earlier one.
export async function requestPasswordReset(
  email: string,
  language: EmailLanguage,
): Promise<void> {
  const user = await User.findOne({ where: { email: normalizeEmail(email) } });
  if (!user) {
    return;
  }

  // 32 random bytes: far too many possibilities to guess
  const token = randomBytes(32).toString("base64url");
  await sequelize.transaction(async (transaction) => {
    await PasswordResetToken.destroy({
      where: { userId: user.id },
      transaction,
    });
    await PasswordResetToken.create(
      {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000),
      },
      { transaction },
    );
  });

  const link = `${webAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await getEmailSender().send(
    passwordResetEmail({
      to: user.email,
      firstName: user.firstName,
      language,
      link,
      validMinutes: RESET_LINK_MINUTES,
    }),
  );
}

async function findValidToken(
  token: string,
  transaction: Transaction | null = null,
): Promise<PasswordResetToken | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) {
    return null;
  }
  return PasswordResetToken.findOne({
    where: { tokenHash: hashToken(token), expiresAt: { [Op.gt]: new Date() } },
    transaction,
    // Inside the reset, the row is locked so a link cannot be used twice at once
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
}

// Whether a link still works, so the web app can say so before the user
// types a new password
export async function isResetTokenValid(token: string): Promise<boolean> {
  return (await findValidToken(token)) !== null;
}

// Sets the new password and uses up the link. Every session started before
// it ends (see requireAuth). Returns the account's email.
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<string> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  return sequelize.transaction(async (transaction) => {
    const reset = await findValidToken(token, transaction);
    if (!reset) {
      throw new InvalidResetTokenError("This link is invalid or has expired");
    }
    const user = await User.findByPk(reset.userId, { transaction });
    if (!user) {
      throw new InvalidResetTokenError("This link is invalid or has expired");
    }
    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    await user.save({ transaction });
    await PasswordResetToken.destroy({
      where: { userId: user.id },
      transaction,
    });
    return user.email;
  });
}
