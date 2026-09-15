import { redirect } from "next/navigation";
export default function AddProductPage() {
  redirect("/products?add=1");
}
