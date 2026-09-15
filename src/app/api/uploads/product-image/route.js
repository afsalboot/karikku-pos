import { endpoint, ok } from "@/lib/http";
import { requireUser, admin, fail } from "@/lib/auth";
import { uploadProductImage } from "@/lib/cloudinary";
import { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/product-images";
export const runtime = "nodejs";
export const POST = endpoint(
  async (request) => {
    admin(await requireUser());
    const limit = MAX_PRODUCT_IMAGE_BYTES + 65536;
    if (Number(request.headers.get("content-length")) > limit)
      fail(413, "Choose an image up to 5 MB.");
    const reader = request.body?.getReader();
    if (!reader) fail(400, "Choose an image to upload.");
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        fail(413, "Choose an image up to 5 MB.");
      }
      chunks.push(value);
    }
    let data;
    try {
      data = await new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": request.headers.get("content-type") },
      }).formData();
    } catch {
      fail(400, "Invalid image upload.");
    }
    const file = data.get("file");
    if (!(file instanceof File) || data.getAll("file").length !== 1)
      fail(400, "Choose one image to upload.");
    const result = await uploadProductImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );
    return ok(result, "Image uploaded", 201);
  },
  { multipart: true },
);
