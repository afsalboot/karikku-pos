export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateProductImage(bytes, type) {
  const invalid = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (!bytes.length || bytes.length > MAX_PRODUCT_IMAGE_BYTES)
    invalid("Choose an image up to 5 MB.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (type === "image/jpeg" && jpeg) ||
    (type === "image/png" && png) ||
    (type === "image/webp" && webp)
  ))
    invalid("Choose a valid JPEG, PNG or WebP image.");
}
