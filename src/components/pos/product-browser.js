import ProductImage from "./product-image";
import { Search, Plus, ShoppingBasket } from "lucide-react";
import { formatCurrency } from "@/lib/client";
import { Notice, EmptyState, Pagination } from "@/components/ui/shared";

export default function ProductBrowser({
  products,
  categories,
  query,
  setQuery,
  category,
  setCategory,
  page,
  setPage,
  pending,
  select,
  items,
}) {
  const visible =
    products.data?.items.filter((product) => product.categoryId?.active) || [];
  return (
    <section className="w-full min-w-0 max-w-full" aria-label="Product menu">
      <div className="relative">
        <Search
          size={19}
          className="pointer-events-none absolute left-4 top-3.5 text-[#6a756c]"
          aria-hidden="true"
        />
        <input
          className="h-12 w-full rounded-xl border border-[#e3e8e0] bg-white pl-12! pr-4 text-sm focus:border-[#3d704c]"
          aria-label="Search menu"
          placeholder="Search products..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div
        className="my-4 flex gap-2 overflow-x-auto pb-1"
        role="group"
        aria-label="Product categories"
      >
        {[
          { _id: "", name: "All Products" },
          { _id: "special", name: "Special" },
          ...(categories.data?.filter((item) => item.active) || []),
        ].map((item) => (
          <button
            key={item._id}
            type="button"
            aria-pressed={category === item._id}
            className={`min-h-10 shrink-0 rounded-lg border px-4 text-xs font-medium transition-colors duration-150 ${category === item._id ? "border-[#93ad82] bg-[#eaf2e5] text-[#245b3a]" : "border-[#e3e8e0] bg-white text-[#6a756c] hover:border-[#93ad82]"}`}
            onClick={() => {
              setCategory(item._id);
              setPage(1);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      {categories.error && (
        <p className="mb-3 text-xs text-red-800" role="alert">
          Categories could not load.{" "}
          <button
            type="button"
            className="underline"
            onClick={categories.refresh}
          >
            Retry
          </button>
        </p>
      )}
      <Notice {...products} retry={products.refresh}>
        {visible.length ? (
          <div className="pos-product-grid grid w-full min-w-0 grid-cols-2 gap-3.5 min-[1100px]:grid-cols-3 min-[1400px]:grid-cols-4 min-[1800px]:grid-cols-5">
            {visible.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                pending={pending}
                select={select}
                count={items
                  .filter((item) => item.productId === product._id)
                  .reduce((sum, item) => sum + item.quantity, 0)}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="No active products found" />
        )}
      </Notice>
      {products.data?.pages > 1 ? (
        <Pagination data={products.data} page={page} setPage={setPage} />
      ) : (
        products.data && (
          <p className="mt-5 text-xs text-[#6a756c]">
            {visible.filter((p) => p.available !== false).length} products{" "}
            available
          </p>
        )
      )}
    </section>
  );
}
function ProductCard({ product, pending, select, count }) {
  return (
    <button
      type="button"
      disabled={pending || product.available === false}
      className="pos-product-card group relative flex w-full min-w-0 max-w-full flex-col rounded-xl border border-[#e3e8e0] bg-white p-3 text-left transition duration-150 hover:border-[#8aaa79] hover:shadow-sm active:scale-[.99]"
      onClick={() => select(product)}
    >
      <div className="relative mb-3 aspect-[4/3] w-full min-w-0 shrink-0 overflow-hidden rounded-lg bg-white lg:aspect-square">
        <ProductImage src={product.imageUrl} desktopFit="cover" />
        {product.available === false && (
          <span className="absolute inset-x-0 bottom-0 bg-[#fff0df] p-1.5 text-center text-xs font-semibold text-[#93501c]">
            Sold Out
          </span>
        )}
        {count > 0 && (
          <span
            className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-[#245b3a] px-2 py-1 text-xs font-semibold text-white"
            aria-label={`${count} in cart`}
          >
            <ShoppingBasket size={12} aria-hidden="true" />
            {count}
          </span>
        )}
      </div>
      <strong className="line-clamp-2 text-sm leading-5 text-[#162219]">
        {product.name}
      </strong>
      <small className="mt-1 truncate text-xs text-[#6a756c]">
        {product.categoryId?.name}
      </small>
      <div className="mt-auto flex items-center justify-between gap-1 pt-3">
        <span className="text-sm font-semibold text-[#245b3a]">
          {product.variantsEnabled
            ? `From ${formatCurrency(Math.min(...product.variants.map((variant) => variant.price)))}`
            : formatCurrency(product.basePrice)}
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eaf2e5] text-[#245b3a] transition-colors group-hover:bg-[#245b3a] group-hover:text-white">
          <Plus size={18} aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
