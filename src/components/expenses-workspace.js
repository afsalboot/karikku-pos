"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  Eye,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Search,
  Tag,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { format, startOfMonth, startOfWeek, subDays } from "date-fns";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/layout/app-shell";
import Modal from "@/components/modal";
import { Notice } from "@/components/ui/shared";
import { useData, useDebounce } from "@/hooks/useData";
import { api, formatCurrency } from "@/lib/client";
import { businessDate } from "@/lib/dates";
import {
  ExpenseInsights,
  ExpenseSkeleton,
  useExpenseRecords,
} from "@/components/expense-insights";
import { filterExpenses, summarizeExpenses } from "@/lib/expense-insights";
import "./expenses-premium.css";

const paymentMethods = ["Cash", "UPI", "Card", "Bank Transfer"];
const defaultCategories = [
  "Purchase",
  "Utilities",
  "Salary",
  "Transport",
  "Maintenance",
  "Rent",
  "Marketing",
  "Other",
];
const periods = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

function blankExpense() {
  return {
    categoryId: "",
    description: "",
    amount: "",
    paymentMethod: "",
    expenseDate: businessDate(),
    note: "",
  };
}

function formatExpenseDate(value) {
  return format(new Date(value), "dd MMM yyyy");
}

function paymentLabel(method) {
  if (method === "UPI") return "GPay / UPI";
  return method;
}

function rangeForPeriod(key) {
  const now = new Date(`${businessDate()}T12:00:00`);
  let from = now;
  let to = now;
  if (key === "yesterday") from = to = subDays(now, 1);
  if (key === "week") from = startOfWeek(now, { weekStartsOn: 1 });
  if (key === "month") from = startOfMonth(now);
  return {
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  };
}

export default function ExpensesWorkspace({ initialAdd = false }) {
  const { user } = useAuth();
  const [period, setPeriod] = useState("month");
  const [range, setRange] = useState(() => rangeForPeriod("month"));
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [viewing, setViewing] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [payment, setPayment] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [editor, setEditor] = useState(() =>
    initialAdd ? blankExpense() : null,
  );
  const [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false);
  const q = useDebounce(query);
  const records = useExpenseRecords(range);
  const filters = { q, category, payment, createdBy };
  const matching = filterExpenses(records.items, filters);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(matching.length / limit)),
  );
  const creators = [
    ...new Map(
      records.items.map((item) => [
        item.createdBy?.userId,
        { _id: item.createdBy?.userId, name: item.createdBy?.name },
      ]),
    ).values(),
  ].filter((item) => item._id);
  const result = {
    ...records,
    data:
      records.loading || records.error
        ? null
        : {
            items: matching.slice(
              (currentPage - 1) * limit,
              currentPage * limit,
            ),
            total: matching.length,
            pages: Math.ceil(matching.length / limit),
            summary: summarizeExpenses(matching),
            creators,
          },
  };
  const categories = useData("/expense-categories");
  const filtersActive = Boolean(query || category || payment || createdBy);
  function editExpense(expense) {
    setViewing(null);
    setEditor({
      ...expense,
      expenseDate: businessDate(new Date(expense.expenseDate)),
    });
  }

  function choosePeriod(key) {
    setPeriod(key);
    setPage(1);
    if (key !== "custom") setRange(rangeForPeriod(key));
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setPayment("");
    setCreatedBy("");
    setPage(1);
  }

  async function remove() {
    setPending(true);
    try {
      await api(`/expenses/${deleting._id}`, { method: "DELETE", body: {} });
      setDeleting(null);
      result.refresh();
      toast.success("Expense deleted successfully.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="expense-page">
        <header className="expense-header">
          <div>
            <h1>Expenses</h1>
            <p>Track, analyze and control business spending.</p>
            <small className="expense-selected-period">
              {formatExpenseDate(range.from)} – {formatExpenseDate(range.to)}
            </small>
          </div>
          <button
            className="expense-add-button"
            onClick={() => setEditor(blankExpense())}
          >
            <Plus size={18} />
            Add Expense
          </button>
        </header>

        <ExpensePeriodControl
          period={period}
          choosePeriod={choosePeriod}
          range={range}
          apply={(value) => {
            setRange(value);
            setPage(1);
          }}
        />
        {result.loading ? (
          <ExpenseSkeleton />
        ) : (
          !result.error && (
            <>
              <ExpenseSummaryCards summary={result.data?.summary} />
              <ExpenseInsights
                items={matching}
                previous={records.previous}
                filters={filters}
                range={range}
              />
            </>
          )
        )}

        <section className="expense-panel">
          <div className="expense-ledger-heading">
            <h2>Expense Records</h2>
            <span>
              {result.loading
                ? "Loading records…"
                : `${matching.length} entries in this period`}
            </span>
          </div>
          <ExpenseFilters
            query={query}
            setQuery={(value) => {
              setQuery(value);
              setPage(1);
            }}
            category={category}
            setCategory={(value) => {
              setCategory(value);
              setPage(1);
            }}
            payment={payment}
            setPayment={(value) => {
              setPayment(value);
              setPage(1);
            }}
            createdBy={createdBy}
            setCreatedBy={(value) => {
              setCreatedBy(value);
              setPage(1);
            }}
            categories={categories.data || []}
            creators={result.data?.creators || []}
            filtersActive={filtersActive}
            clearFilters={clearFilters}
          />
          {result.loading ? (
            <ExpenseSkeleton compact />
          ) : (
            <Notice {...result} retry={result.refresh}>
              {result.data?.items.length ? (
                <>
                  <ExpenseTable
                    items={result.data.items}
                    canManage={user.role === "ADMIN"}
                    onView={setViewing}
                    onEdit={(expense) =>
                      setEditor({
                        ...expense,
                        expenseDate: businessDate(
                          new Date(expense.expenseDate),
                        ),
                      })
                    }
                    onDelete={setDeleting}
                  />
                  <ExpenseMobileList
                    items={result.data.items}
                    canManage={user.role === "ADMIN"}
                    onView={setViewing}
                    onEdit={(expense) =>
                      setEditor({
                        ...expense,
                        expenseDate: businessDate(
                          new Date(expense.expenseDate),
                        ),
                      })
                    }
                    onDelete={setDeleting}
                  />
                </>
              ) : (
                <ExpenseEmptyState
                  filtersActive={filtersActive}
                  clearFilters={clearFilters}
                  onAdd={() => setEditor(blankExpense())}
                />
              )}
            </Notice>
          )}
          {result.data?.total > 0 && (
            <ExpensePagination
              data={result.data}
              page={currentPage}
              setPage={setPage}
              limit={limit}
              setLimit={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          )}
        </section>
      </div>

      {viewing && (
        <ExpenseDetails
          expense={viewing}
          canManage={user.role === "ADMIN"}
          onClose={() => setViewing(null)}
          onEdit={editExpense}
          onDelete={(expense) => {
            setViewing(null);
            setDeleting(expense);
          }}
        />
      )}
      {editor && (
        <ExpenseFormModal
          initial={editor}
          categories={categories.data || []}
          reloadCategories={categories.refresh}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            result.refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteExpenseModal
          expense={deleting}
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

function ExpenseSummaryCards({ summary }) {
  const cards = [
    {
      label: "Total Expenses",
      value: formatCurrency(summary?.amount || 0),
      meta: "Selected period",
      icon: WalletCards,
    },
    {
      label: "Transactions",
      value: summary?.transactions || 0,
      meta: "Expense entries",
      icon: Receipt,
    },
    {
      label: "Average Expense",
      value: formatCurrency(summary?.average || 0),
      meta: "Per transaction",
      icon: Calculator,
    },
    {
      label: "Top Category",
      value: summary?.topCategory?._id || "-",
      meta: summary?.topCategory
        ? `${formatCurrency(summary.topCategory.amount)} spent · ${((summary.topCategory.amount / summary.amount) * 100).toFixed(1)}% of total`
        : "No spending yet",
      icon: Tag,
    },
  ];
  return (
    <div className="expense-summary-grid">
      {cards.map((card) => (
        <ExpenseSummaryCard key={card.label} {...card} />
      ))}
    </div>
  );
}

function ExpenseSummaryCard({ label, value, meta, icon: Icon }) {
  return (
    <article className="expense-summary-card">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  );
}

function ExpensePeriodControl({ period, choosePeriod, range, apply }) {
  const [draft, setDraft] = useState(range);
  return (
    <div className="expense-period-control">
      <div className="expense-periods" aria-label="Expense period">
        {periods.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={period === item.key}
            className={period === item.key ? "active" : ""}
            onClick={() => {
              setDraft(range);
              choosePeriod(item.key);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <form
          className="expense-date-filters"
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <label>
            From Date
            <input
              type="date"
              required
              value={draft.from}
              max={draft.to}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
            />
          </label>
          <label>
            To Date
            <input
              type="date"
              required
              value={draft.to}
              min={draft.from}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
            />
          </label>
          <button className="button primary" type="submit">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

function ExpenseFilters({
  query,
  setQuery,
  category,
  setCategory,
  payment,
  setPayment,
  createdBy,
  setCreatedBy,
  categories,
  creators,
  filtersActive,
  clearFilters,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = [category, payment, createdBy].filter(Boolean).length;
  const choices = (
    <>
      <label>
        Category
        <select
          aria-label="Expense category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Payment
        <select
          aria-label="Expense payment"
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
        >
          <option value="">All Payments</option>
          {paymentMethods.map((method) => (
            <option key={method} value={method}>
              {paymentLabel(method)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Added By
        <select
          aria-label="Created by"
          value={createdBy}
          onChange={(event) => setCreatedBy(event.target.value)}
        >
          <option value="">All Users</option>
          {creators.map((creator) => (
            <option key={creator._id} value={creator._id}>
              {creator.name || "Unknown user"}
            </option>
          ))}
        </select>
      </label>
      {filtersActive && (
        <button className="expense-clear-button" onClick={clearFilters}>
          <X size={15} />
          Reset Filters
        </button>
      )}
    </>
  );
  return (
    <div className="expense-filters">
      <div className="expense-filter-row">
        <label className="expense-search">
          <Search size={16} />
          <input
            aria-label="Search description, category, amount or user"
            placeholder="Search description, category, amount or user…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="expense-desktop-filters">{choices}</div>
        <button
          className="button secondary expense-mobile-filter-toggle"
          onClick={() => setMobileOpen(true)}
        >
          <SlidersHorizontal size={16} />
          Filters{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
      {mobileOpen && (
        <Modal title="Expense Filters" onClose={() => setMobileOpen(false)}>
          <div className="modal-body expense-mobile-filters">{choices}</div>
          <footer className="modal-footer">
            <button
              className="button primary"
              onClick={() => setMobileOpen(false)}
            >
              Show Expenses
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function ExpenseTable({ items, canManage, onEdit, onDelete, onView }) {
  return (
    <div className="expense-table-scroll">
      <table className="expense-table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Payment</th>
            <th>Added By</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((expense) => (
            <tr key={expense._id} onClick={() => onView(expense)}>
              <td>
                {formatExpenseDate(expense.expenseDate)}
                <small title="Time this entry was recorded">
                  {recordedTime(expense.createdAt)} · recorded
                </small>
              </td>
              <td>
                <ExpenseCategoryBadge category={expense.categoryName} />
              </td>
              <td>
                <button
                  className="expense-description expense-view-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(expense);
                  }}
                >
                  {expense.description}
                </button>
                {expense.note && <small>{expense.note}</small>}
              </td>
              <td className="expense-amount">
                {formatCurrency(expense.amount)}
              </td>
              <td>
                <PaymentBadge method={expense.paymentMethod} />
              </td>
              <td>{expense.createdBy?.name || "Unknown"}</td>
              <td>
                {
                  <ExpenseActionMenu
                    expense={expense}
                    canManage={canManage}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseMobileList({ items, canManage, onEdit, onDelete, onView }) {
  return (
    <div className="expense-mobile-list">
      {items.map((expense) => (
        <article className="expense-mobile-card" key={expense._id}>
          <div>
            <ExpenseCategoryBadge category={expense.categoryName} />
            {
              <ExpenseActionMenu
                expense={expense}
                canManage={canManage}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            }
          </div>
          <button className="expense-view-link" onClick={() => onView(expense)}>
            {expense.description}
          </button>
          {expense.note && <small>{expense.note}</small>}
          <dl>
            <div>
              <dt>Date</dt>
              <dd>
                {formatExpenseDate(expense.expenseDate)}
                <small>{recordedTime(expense.createdAt)} · recorded</small>
              </dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatCurrency(expense.amount)}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{paymentLabel(expense.paymentMethod)}</dd>
            </div>
            <div>
              <dt>Created by</dt>
              <dd>{expense.createdBy?.name || "Unknown"}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function ExpenseActionMenu({ expense, canManage, onView, onEdit, onDelete }) {
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    function close(event) {
      if (
        buttonRef.current?.contains(event.target) ||
        event.target.closest?.(".expense-action-menu")
      )
        return;
      setPosition(null);
    }
    function escape(event) {
      if (event.key === "Escape") {
        setPosition(null);
        buttonRef.current?.focus();
      }
    }
    function moved() {
      setPosition(null);
    }
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", moved);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", moved);
    };
  }, [position]);

  function toggle() {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({
      top: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - 155)),
      left: Math.max(12, rect.right - 190),
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="expense-more-button"
        aria-label={`Open actions for ${expense.description}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
      >
        <MoreVertical size={18} />
      </button>
      {position &&
        createPortal(
          <div
            className="expense-action-menu"
            role="menu"
            ref={(node) =>
              node?.querySelector("button")?.focus({ preventScroll: true })
            }
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const buttons = [
                ...event.currentTarget.querySelectorAll("button"),
              ];
              const index = buttons.indexOf(document.activeElement);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                buttons[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                        buttons.length
                ]?.focus();
              }
              if (event.key === "Escape" || event.key === "Tab") {
                setPosition(null);
                buttonRef.current?.focus();
              }
            }}
            style={{ top: position.top, left: position.left }}
          >
            <button
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onView(expense);
              }}
            >
              <Eye size={15} />
              View Details
            </button>
            {canManage && (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    setPosition(null);
                    onEdit(expense);
                  }}
                >
                  <Pencil size={15} />
                  Edit Expense
                </button>
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setPosition(null);
                    onDelete(expense);
                  }}
                >
                  <Trash2 size={15} />
                  Delete Expense
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function ExpenseCategoryBadge({ category }) {
  const key = (category || "Other").toLowerCase();
  const tone =
    ["purchase", "utilities", "salary", "transport", "maintenance"].find(
      (item) => key.includes(item),
    ) || "other";
  return (
    <span className={`expense-category-badge ${tone}`}>
      {category || "Other"}
    </span>
  );
}

function PaymentBadge({ method }) {
  return <span className="expense-payment-badge">{paymentLabel(method)}</span>;
}

function ExpenseEmptyState({ filtersActive, clearFilters, onAdd }) {
  return (
    <div className="expense-empty">
      <div>
        <Receipt size={28} />
      </div>
      <h2>{filtersActive ? "No matching expenses" : "No expenses recorded"}</h2>
      <p>
        {filtersActive
          ? "Try changing or clearing your filters."
          : "Expenses for the selected period will appear here."}
      </p>
      {filtersActive ? (
        <button className="button secondary" onClick={clearFilters}>
          Clear Filters
        </button>
      ) : (
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          Add First Expense
        </button>
      )}
    </div>
  );
}

function ExpensePagination({ data, page, setPage, limit, setLimit }) {
  const total = data?.total || 0;
  const pages = Math.max(1, data?.pages || 1);
  const start = total ? (page - 1) * limit + 1 : 0;
  const end = Math.min(page * limit, total);
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);

  return (
    <footer className="expense-pagination">
      <span>
        Showing {start}-{end} of {total} expenses
      </span>
      <label className="expense-page-size">
        Rows per page
        <select
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          {[10, 25, 50].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="button secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={15} />
          Previous
        </button>
        {pageNumbers.map((item, index) => (
          <span className="expense-page-step" key={item}>
            {index > 0 && item - pageNumbers[index - 1] > 1 && <span>…</span>}
            <button
              key={item}
              className="expense-page-number"
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          </span>
        ))}
        <button
          className="button secondary"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
          <ChevronRight size={15} />
        </button>
      </div>
    </footer>
  );
}

function ExpenseFormModal({
  initial,
  categories,
  reloadCategories,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(initial._id);
  const [form, setForm] = useState({
    categoryId: initial.categoryId || "",
    description: initial.description || "",
    amount: initial.amount || "",
    paymentMethod: initial.paymentMethod || "",
    expenseDate: initial.expenseDate || businessDate(),
    note: initial.note || "",
  });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [extraCategories, setExtraCategories] = useState([]);
  const choices = [
    ...categories,
    ...extraCategories.filter(
      (item) => !categories.some((category) => category._id === item._id),
    ),
  ];

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function validate() {
    const nextErrors = {};
    if (!Number(form.amount) || Number(form.amount) <= 0)
      nextErrors.amount = "Amount must be greater than 0.";
    if (!form.categoryId) nextErrors.categoryId = "Choose a category.";
    if (!form.description.trim())
      nextErrors.description = "Enter an expense description.";
    if (!form.paymentMethod)
      nextErrors.paymentMethod = "Choose a payment method.";
    if (!form.expenseDate) nextErrors.expenseDate = "Choose an expense date.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    setPending(true);
    setErrors({});
    try {
      await api(initial._id ? `/expenses/${initial._id}` : "/expenses", {
        method: initial._id ? "PATCH" : "POST",
        body: {
          ...form,
          amount: Number(form.amount),
          note: form.note.trim(),
          description: form.description.trim(),
        },
      });
      toast.success(
        isEdit
          ? "Expense updated successfully."
          : "Expense added successfully.",
      );
      onSaved();
    } catch (e) {
      setErrors({ form: e.message });
      toast.error(e.message);
    } finally {
      setPending(false);
    }
  }

  function handleCategoryChange(value) {
    if (value === "__new__") {
      setCategoryOpen(true);
      return;
    }
    update("categoryId", value);
  }

  return (
    <>
      <Modal
        title={isEdit ? "Edit Expense" : "Add Expense"}
        description={
          isEdit
            ? "Update this business expense."
            : "Record a new business expense."
        }
        onClose={pending ? () => {} : onClose}
      >
        <form className="expense-form" onSubmit={submit}>
          <fieldset className="modal-body" disabled={pending}>
            <div className="expense-field-grid">
              <ExpenseField label="Amount *" error={errors.amount}>
                <div className="expense-amount-input">
                  <span>₹</span>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(event) => update("amount", event.target.value)}
                  />
                </div>
              </ExpenseField>
              <ExpenseField label="Expense Date *" error={errors.expenseDate}>
                <input
                  name="expenseDate"
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) =>
                    update("expenseDate", event.target.value)
                  }
                />
              </ExpenseField>
            </div>
            <ExpenseField label="Category *" error={errors.categoryId}>
              <select
                name="categoryId"
                value={form.categoryId}
                onChange={(event) => handleCategoryChange(event.target.value)}
              >
                <option value="" disabled>
                  Select Category
                </option>
                {choices.map((category) => (
                  <option
                    key={category._id}
                    value={category._id}
                    disabled={!category.active}
                  >
                    {category.name}
                  </option>
                ))}
                <option value="__new__">+ Add New Category</option>
              </select>
            </ExpenseField>
            <ExpenseField label="Description *" error={errors.description}>
              <input
                name="description"
                placeholder="Enter expense description"
                maxLength={200}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </ExpenseField>
            <fieldset className="expense-field expense-payment-field">
              <legend>Payment Method *</legend>
              <div className="expense-payment-options">
                {paymentMethods.map((method) => (
                  <button
                    type="button"
                    key={method}
                    className={form.paymentMethod === method ? "active" : ""}
                    aria-pressed={form.paymentMethod === method}
                    onClick={() => update("paymentMethod", method)}
                  >
                    {paymentLabel(method)}
                  </button>
                ))}
              </div>
              {errors.paymentMethod && (
                <small className="expense-field-error" role="alert">
                  {errors.paymentMethod}
                </small>
              )}
            </fieldset>
            <ExpenseField label="Notes" error={errors.note}>
              <textarea
                name="note"
                placeholder="Optional notes"
                maxLength={500}
                value={form.note}
                onChange={(event) => update("note", event.target.value)}
              />
            </ExpenseField>
            <p className="expense-form-note">
              Created by{" "}
              {isEdit
                ? initial.createdBy?.name || "current user"
                : "logged-in user"}
              .
            </p>
            {errors.form && <p className="form-error">{errors.form}</p>}
          </fieldset>
          <footer className="modal-footer">
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button primary" disabled={pending}>
              {pending
                ? "Saving..."
                : isEdit
                  ? "Update Expense"
                  : "Save Expense"}
            </button>
          </footer>
        </form>
      </Modal>
      {categoryOpen && (
        <ExpenseCategoryModal
          onClose={() => setCategoryOpen(false)}
          onCreated={(category) => {
            setExtraCategories((current) => [...current, category]);
            update("categoryId", category._id);
            reloadCategories();
            setCategoryOpen(false);
          }}
        />
      )}
    </>
  );
}

function ExpenseField({ label, error, children }) {
  return (
    <label className="expense-field">
      <span>{label}</span>
      {children}
      {error && <small className="expense-field-error">{error}</small>}
    </label>
  );
}

function ExpenseCategoryModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const category = await api("/expense-categories", {
        method: "POST",
        body: { name, active: true },
      });
      toast.success("Expense category created");
      onCreated(category);
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      title="Create Expense Category"
      compact
      onClose={pending ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="expense-field">
            <span>Category name</span>
            <input
              autoFocus
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="expense-category-suggestions">
            {defaultCategories.map((category) => (
              <button
                type="button"
                key={category}
                onClick={() => setName(category)}
              >
                {category}
              </button>
            ))}
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? "Creating..." : "Create"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function DeleteExpenseModal({ expense, pending, onClose, onConfirm }) {
  return (
    <Modal
      title="Delete Expense?"
      compact
      onClose={pending ? () => {} : onClose}
    >
      <div className="modal-body">
        <div className="expense-delete-icon">
          <Trash2 size={24} />
        </div>
        <p className="expense-delete-copy">
          Are you sure you want to delete this expense of{" "}
          {formatCurrency(expense.amount)}? This action cannot be undone.
        </p>
        <strong>{expense.description}</strong>
        <small>{formatCurrency(expense.amount)}</small>
      </div>
      <footer className="modal-footer">
        <button
          className="button secondary"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Deleting..." : "Delete Expense"}
        </button>
      </footer>
    </Modal>
  );
}

function recordedTime(value) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not recorded";
}

function ExpenseDetails({ expense, canManage, onClose, onEdit, onDelete }) {
  const timestamp = (value) =>
    value
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(value))
      : "Not recorded";
  const fields = [
    ["Category", expense.categoryName],
    ["Description", expense.description],
    ["Payment Method", paymentLabel(expense.paymentMethod)],
    ["Expense Date", formatExpenseDate(expense.expenseDate)],
    ["Expense Time", "Not recorded separately"],
    ["Created By", expense.createdBy?.name || "Unknown"],
    ["Notes", expense.note || "No notes added"],
    ["Receipt / Attachment", "Not available for this record"],
    ["Created At", timestamp(expense.createdAt)],
    ["Last Updated", timestamp(expense.updatedAt)],
  ];
  return (
    <Modal title="Expense Details" drawer onClose={onClose}>
      <div className="modal-body expense-details">
        <div className="expense-detail-total">
          <span>Expense Amount</span>
          <strong>{formatCurrency(expense.amount)}</strong>
        </div>
        <dl>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {canManage && (
        <footer className="modal-footer">
          <button className="button secondary" onClick={() => onEdit(expense)}>
            <Pencil size={16} />
            Edit Expense
          </button>
          <button className="button danger" onClick={() => onDelete(expense)}>
            <Trash2 size={16} />
            Delete Expense
          </button>
        </footer>
      )}
    </Modal>
  );
}
