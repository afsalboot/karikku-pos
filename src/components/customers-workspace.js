"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Search, RotateCcw, MoreHorizontal, Users } from "lucide-react";
import { useData, useDebounce } from "@/hooks/useData";
import { formatCurrency, formatDate } from "@/lib/client";
import { PageHeading } from "./ui/shared";
import RecordPagination from "./ui/record-pagination";
import Modal from "./modal";
import CustomerDetails from "./customers/customer-details";
import CustomerActions from "./customers/customer-actions";
import SaleDetails from "./sales/sale-details";
export default function CustomersWorkspace() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [lastPurchase, setLastPurchase] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState(null);
  const [sale, setSale] = useState(null);
  const [version, setVersion] = useState(0);
  const [menu, setMenu] = useState(null);
  const q = useDebounce(query, 350);
  const result = useData(
    `/customers?${new URLSearchParams({ q, type, lastPurchase, sort, page, limit })}`,
  );
  const data = result.data;
  const closeMenu = useCallback(() => setMenu(null), []);
  function filter(set, value) {
    set(value);
    setPage(1);
  }
  function reset() {
    setQuery("");
    setType("");
    setLastPurchase("");
    setSort("newest");
    setPage(1);
  }
  function view(id, full = false) {
    setSelected({ id, full });
  }
  const filtered = Boolean(query || type || lastPurchase);
  return (
    <div className="customers-workspace">
      <PageHeading
        title="Customers"
        description="Manage customers and view their purchase history."
      />
      <div
        className="product-summary customer-summary"
        aria-label="Customer statistics"
      >
        {[
          ["Total Customers", "totalCustomers", "Saved customers"],
          [
            "Returning Customers",
            "returningCustomers",
            "More than one paid purchase",
          ],
          ["New This Month", "newCustomers", "First saved this month"],
          ["Customer Sales", "customerSales", "Paid sales this month"],
        ].map(([label, key, note]) => (
          <section key={key}>
            <span>{label}</span>
            {result.loading ? (
              <span className="product-skeleton summary-skeleton" />
            ) : (
              <strong>
                {data?.summary
                  ? key === "customerSales"
                    ? formatCurrency(data.summary[key])
                    : data.summary[key]
                  : "\u2014"}
              </strong>
            )}
            <small>{note}</small>
          </section>
        ))}
      </div>
      <section className="products-panel customer-directory">
        <div className="product-toolbar customer-toolbar">
          <div className="product-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search customers"
              placeholder="Search customers by name or phone..."
              value={query}
              onChange={(e) => filter(setQuery, e.target.value)}
            />
          </div>
          <select
            aria-label="Customer type"
            value={type}
            onChange={(e) => filter(setType, e.target.value)}
          >
            <option value="">All Customers</option>
            <option value="new">New Customers</option>
            <option value="returning">Returning Customers</option>
          </select>
          <select
            aria-label="Last purchase"
            value={lastPurchase}
            onChange={(e) => filter(setLastPurchase, e.target.value)}
          >
            <option value="">Last Purchase: Any Time</option>
            {[
              ["today", "Today"],
              ["7", "Last 7 Days"],
              ["30", "Last 30 Days"],
              ["month", "This Month"],
              ["none", "No Purchases"],
            ].map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort customers"
            value={sort}
            onChange={(e) => filter(setSort, e.target.value)}
          >
            {[
              ["newest", "Newest Customers"],
              ["oldest", "Oldest Customers"],
              ["orders", "Most Orders"],
              ["spend", "Highest Spend"],
              ["recent", "Recent Purchase"],
              ["name", "Name A-Z"],
            ].map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="button secondary" onClick={reset}>
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
        {result.error ? (
          <div className="product-empty" role="alert">
            <p>{result.error}</p>
            <button className="button secondary" onClick={result.refresh}>
              Retry
            </button>
          </div>
        ) : (
          <div className="customer-table-wrap" aria-busy={result.loading}>
            <table className="customer-table">
              <thead>
                <tr>
                  {[
                    "Customer",
                    "Phone",
                    "Orders",
                    "Total Spent",
                    "Average Order",
                    "Last Purchase",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr
                        className="customer-loading-row"
                        key={i}
                        aria-hidden="true"
                      >
                        {Array.from({ length: 7 }, (_, j) => (
                          <td key={j}>
                            <span className="product-skeleton" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((c) => (
                      <tr key={c._id} onClick={() => view(c._id)}>
                        <td className="customer-identity">
                          <button
                            className="customer-name"
                            onClick={(e) => {
                              e.stopPropagation();
                              view(c._id);
                            }}
                          >
                            <span className="customer-avatar">
                              {(c.name || "Customer").charAt(0).toUpperCase()}
                            </span>
                            <span>
                              <strong>{c.name || "Customer"}</strong>
                              <small>
                                {c.orders > 1 ? "Returning" : "New"} customer
                              </small>
                            </span>
                          </button>
                        </td>
                        <td className="customer-phone">{c.phone}</td>
                        <td data-label="Orders">{c.orders}</td>
                        <td data-label="Total Spent" className="customer-money">
                          {formatCurrency(c.totalSpent)}
                        </td>
                        <td
                          data-label="Average Order"
                          className="customer-average customer-money"
                        >
                          {formatCurrency(c.averageOrder)}
                        </td>
                        <td
                          data-label="Last Purchase"
                          className="customer-last"
                        >
                          {c.lastPurchase
                            ? formatDate(c.lastPurchase)
                            : "No purchases"}
                        </td>
                        <td className="customer-row-actions">
                          <button
                            className="customer-mobile-view text-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              view(c._id);
                            }}
                          >
                            View Customer
                          </button>
                          <button
                            className="icon-button customer-more"
                            aria-label={`Actions for ${c.name || "Customer"}`}
                            aria-haspopup="menu"
                            aria-expanded={menu?.customer._id === c._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenu({
                                customer: c,
                                rect: e.currentTarget.getBoundingClientRect(),
                                trigger: e.currentTarget,
                              });
                            }}
                          >
                            <MoreHorizontal size={19} />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
        {!result.loading && !result.error && !data?.items.length && (
          <div className="product-empty">
            <Users size={30} />
            <h3>{filtered ? "No customers found" : "No customers yet"}</h3>
            <p>
              {filtered
                ? "No customers match your search or filters."
                : "Customers saved during checkout will appear here."}
            </p>
            {filtered ? (
              <button className="button secondary" onClick={reset}>
                Clear Filters
              </button>
            ) : (
              <Link className="button primary" href="/pos">
                New Sale
              </Link>
            )}
          </div>
        )}
        <RecordPagination
          data={data}
          page={page}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          label="customers"
          loading={result.loading}
        />
      </section>
      {menu && (
        <CustomerActions menu={menu} onClose={closeMenu} onView={view} />
      )}
      {selected && (
        <Modal
          drawer
          title={
            selected.full ? "Customer Purchase History" : "Customer Details"
          }
          onClose={() => setSelected(null)}
        >
          <CustomerDetails
            id={selected.id}
            full={selected.full}
            version={version}
            onFull={() => setSelected((s) => ({ ...s, full: true }))}
            onSale={setSale}
          />
        </Modal>
      )}
      {sale && (
        <Modal drawer title="Sale Details" onClose={() => setSale(null)}>
          <SaleDetails
            id={sale}
            embedded
            onClose={() => setSale(null)}
            onUpdated={() => {
              result.refresh();
              setVersion((v) => v + 1);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
