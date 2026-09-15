import nextEnv from "@next/env";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/mongodb.js";
import { initialize, getSettings } from "../src/services/settings.js";
import User from "../src/models/User.js";
import Category from "../src/models/Category.js";
import Product from "../src/models/Product.js";
import { passwordSchema } from "../src/lib/validation.js";
nextEnv.loadEnvConfig(process.cwd());
try {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!passwordSchema.safeParse(password).success)
    throw new Error("Set SEED_ADMIN_PASSWORD to 8–12 characters");
  await connectDB();
  await initialize();
  await getSettings();
  const username = (process.env.SEED_ADMIN_USERNAME || "admin").toLowerCase();
  if (!/^[a-z0-9._-]{1,60}$/.test(username))
    throw new Error("Invalid seed username");
  if (await User.exists({ username }))
    console.log("Admin username already exists; password was not changed.");
  else {
    await User.create({
      name: "Administrator",
      username,
      role: "ADMIN",
      active: true,
      passwordHash: await bcrypt.hash(password, 12),
    });
    console.log("Administrator created.");
  }
  if (process.argv.includes("--demo")) {
    for (const [name, productNames] of [
      ["Fresh Juice", ["Mango Juice", "Lime Juice", "Orange Juice"]],
      ["Milk Shake", ["Avocado Shake", "Chocolate Shake"]],
      ["Falooda", ["Falooda"]],
      ["Mojito", []],
      ["Snacks", []],
      ["Ice Cream", []],
    ]) {
      const category = await Category.findOneAndUpdate(
        { normalizedName: name.toLowerCase() },
        { $setOnInsert: { name, active: true } },
        { upsert: true, returnDocument: "after" },
      );
      for (const productName of productNames)
        await Product.updateOne(
          { name: productName, categoryId: category._id },
          {
            $setOnInsert: {
              basePrice: 80,
              active: true,
              variantsEnabled: false,
              addonsEnabled: false,
              variants: [],
              addons: [],
            },
          },
          { upsert: true },
        );
    }
    console.log("Optional sample menu created.");
  }
} catch (error) {
  console.error(
    error.status
      ? error.message
      : error.name === "MongoServerError"
        ? "Database operation failed; check the configured database."
        : error.message,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
