import SaleDetails from "@/components/sales/sale-details";
export default async function SalePage({ params }) {
  const { id } = await params;
  return <SaleDetails id={id} />;
}
