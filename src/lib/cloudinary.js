import { randomUUID } from "node:crypto";
import { validateProductImage } from "./product-images.js";

export function cloudinaryConfig() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !/^[a-zA-Z0-9_-]+$/.test(cloud) || !key || !secret)
    throw Object.assign(
      new Error(
        "Product image uploads are not configured. Check the Cloudinary settings on the server.",
      ),
      { status: 503 },
    );
  return {
    cloud,
    authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
  };
}
export async function uploadProductImage(bytes, type) {
  validateProductImage(bytes, type);
  const { cloud, authorization } = cloudinaryConfig();
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), "product-image");
  form.set("public_id", `karikku/products/${randomUUID()}`);
  form.set("overwrite", "false");
  form.set("transformation", "c_limit,w_1200,h_1200");
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
      {
        method: "POST",
        headers: { Authorization: authorization },
        body: form,
        signal: AbortSignal.timeout(30000),
      },
    );
    const result = await response.json();
    if (
      !response.ok ||
      !result.secure_url?.startsWith(
        `https://res.cloudinary.com/${cloud}/image/upload/`,
      )
    )
      throw new Error("Upload rejected");
    return { url: result.secure_url, publicId: result.public_id };
  } catch {
    throw Object.assign(
      new Error(
        "Image upload failed. Please try again or check the Cloudinary credentials.",
      ),
      { status: 503 },
    );
  }
}
