import { User } from "../models/User.js";

export class UserNotFoundError extends Error {}

// Tokens carry the public user id; the tables are linked by the internal id.
// Throws UserNotFoundError if the account no longer exists.
export async function getInternalUserId(userPublicId: string): Promise<number> {
  const user = await User.findOne({
    where: { publicId: userPublicId },
    attributes: ["id"],
  });
  if (!user) {
    throw new UserNotFoundError("User not found");
  }
  return user.id;
}
