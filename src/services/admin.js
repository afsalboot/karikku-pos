import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Setting, { defaults } from "../models/Setting.js";
import { admin, requireUser, publicUser, fail } from "../lib/auth.js";
import { body, ok, pagination, escapeRegex } from "../lib/http.js";
import {
  id,
  userSchema,
  userUpdateSchema,
  settingSchema,
} from "../lib/validation.js";
import { getSettings, clientSettings, transaction } from "./settings.js";
export async function settings(request) {
  const user = await requireUser();
  const query = new URL(request.url).searchParams;
  if (request.method === "GET" && query.has("export")) {
    admin(user);
    const { exportSettingsData } = await import("./settings-export.js");
    return exportSettingsData(query.get("export"));
  }
  if (request.method === "GET" && query.has("defaults")) {
    admin(user);
    const current = await getSettings();
    return ok({ ...clientSettings({...defaults, invoiceSequence: current.invoiceSequence, startingNumber: Math.max(1, current.invoiceSequence + 1)}, user), loyalty: defaults.loyalty });
  }
  if (request.method === "GET")
    return ok(clientSettings(await getSettings(), user));
  admin(user);
  // Receipt logos are data URLs and must not inherit the generic JSON size cap.
  const { _id, createdAt, updatedAt, __v, loyaltyEnabled, lastIssuedSequence, ...submitted } = await request.json();
  const input = settingSchema.parse(submitted);
  const saved = await transaction(async (session, current) => {
    if (
      input.startingNumber <= current.invoiceSequence &&
      input.startingNumber !== current.startingNumber
    )
      fail(
        400,
        "Starting number must be greater than the last issued invoice number",
      );
    return Setting.findByIdAndUpdate(
      "shop",
      { $set: input },
      { session, returnDocument: "after", runValidators: true },
    ).lean();
  });
  return ok(clientSettings(saved, user), "Settings saved");
}
export async function users(request, recordId) {
  const actor = await requireUser();
  admin(actor);
  if (recordId) id.parse(recordId);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const { page, limit, skip } = pagination(url);
    const q = url.searchParams.get("q");
    const query = q
      ? {
          $or: [
            { name: { $regex: escapeRegex(q), $options: "i" } },
            { username: { $regex: escapeRegex(q), $options: "i" } },
          ],
        }
      : {};
    if (["ADMIN", "CASHIER"].includes(url.searchParams.get("role")))
      query.role = url.searchParams.get("role");
    if (["true", "false"].includes(url.searchParams.get("active")))
      query.active = url.searchParams.get("active") === "true";
    const sort =
      url.searchParams.get("sort") === "nameDesc"
        ? { name: -1, _id: -1 }
        : url.searchParams.get("sort") === "recent"
          ? { createdAt: -1, _id: -1 }
          : { name: 1, _id: 1 };
    const [items, total, summary] = await Promise.all([
      User.find(query).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$active", 1, 0] } },
            admins: { $sum: { $cond: [{ $eq: ["$role", "ADMIN"] }, 1, 0] } },
            staff: { $sum: { $cond: [{ $eq: ["$role", "CASHIER"] }, 1, 0] } },
          },
        },
      ]),
    ]);
    return ok({
      items: items.map(publicUser),
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: summary[0] || { total: 0, active: 0, admins: 0, staff: 0 },
    });
  }
  const input = (recordId ? userUpdateSchema : userSchema).parse(
    await body(request),
  );
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : undefined;
  const result = await transaction(async (session) => {
    const liveActor = await User.findOne({
      _id: actor._id,
      active: true,
      role: "ADMIN",
      tokenVersion: actor.tokenVersion,
    }).session(session);
    if (!liveActor) fail(403, "Your permissions changed. Sign in again.");
    const { password: _password, ...fields } = input;
    if (recordId) {
      const target = await User.findById(recordId).session(session);
      if (!target) fail(404, "User not found");
      if (
        target.active &&
        target.role === "ADMIN" &&
        (!fields.active || fields.role !== "ADMIN") &&
        (await User.countDocuments({ active: true, role: "ADMIN" }).session(
          session,
        )) <= 1
      )
        fail(409, "At least one active administrator is required");
      Object.assign(target, fields);
      if (passwordHash) {
        target.passwordHash = passwordHash;
        target.loginFailures = 0;
        target.lockedUntil = undefined;
      }
      target.tokenVersion++;
      await target.save({ session });
      return publicUser(target);
    }
    if ((await User.countDocuments({}).session(session)) >= 500)
      fail(400, "User limit reached (500)");
    return publicUser(
      (await User.create([{ ...fields, passwordHash }], { session }))[0],
    );
  });
  return ok(
    result,
    recordId ? "User updated; existing sessions revoked" : "User created",
    recordId ? 200 : 201,
  );
}
