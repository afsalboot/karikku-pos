import { redirect } from "next/navigation";
export default async function EditProductPage({ params }) {
  const { id } = await params;
  redirect(`/products?edit=${encodeURIComponent(id)}`);
}
