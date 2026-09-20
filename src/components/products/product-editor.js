"use client";
import Select from "@/components/ui/select";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "../modal";
import ProductImageInput from "../product-image-input";
import { api } from "@/lib/client";
export default function ProductEditor({
  initial,
  categories,
  categoryError,
  reloadCategories,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(initial);
  const [imageFile, setImageFile] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [newCategories, setNewCategories] = useState([]);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [categoryErrorMessage, setCategoryErrorMessage] = useState("");
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const options = [
    ...categories,
    ...newCategories.filter(
      (c) => !categories.some((item) => item._id === c._id),
    ),
  ];
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const clean = (key) =>
      form[key].map((item) => ({
        ...(item._id ? { _id: item._id } : {}),
        name: item.name,
        price: Number(item.price),
      }));
    const payload = {
      name: form.name,
      imageUrl: form.imageUrl || "",
      categoryId: form.categoryId,
      basePrice: Number(form.basePrice),
      active: form.active,
      available: form.available !== false,
      special: form.special === true,
      variantsEnabled: form.variantsEnabled,
      addonsEnabled: form.addonsEnabled,
      variants: form.variantsEnabled ? clean("variants") : [],
      addons: form.addonsEnabled ? clean("addons") : [],
    };
    try {
      if (imageFile) {
        const data = new FormData();
        data.set("file", imageFile);
        const response = await fetch("/api/uploads/product-image", {
          method: "POST",
          body: data,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message || "Image upload failed. Please try again.",
          );
        payload.imageUrl = result.data.url;
        set("imageUrl", result.data.url);
        setImageFile(null);
      }
      await api(initial._id ? `/products/${initial._id}` : "/products", {
        method: initial._id ? "PATCH" : "POST",
        body: payload,
      });
      toast.success(initial._id ? "Product updated" : "Product created");
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  async function createCategory(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCategoryErrorMessage("");
    try {
      const category = await api("/categories", {
        method: "POST",
        body: { name: categoryName, active: true },
      });
      setNewCategories((items) => [...items, category]);
      set("categoryId", category._id);
      reloadCategories();
      setCategoryOpen(false);
      toast.success("Category created");
    } catch (e) {
      setCategoryErrorMessage(e.message);
    } finally {
      setCreating(false);
    }
  }
  return (
    <>
      <Modal
        title={initial._id ? "Edit Product" : "Add Product"}
        onClose={pending ? () => {} : onClose}
      >
        <form onSubmit={submit}>
          <fieldset
            disabled={pending}
            className="modal-body product-editor-body"
          >
            <ProductImageInput
              imageUrl={form.imageUrl || ""}
              file={imageFile}
              disabled={pending}
              onChange={(file) => {
                setImageFile(file);
                if (!file) set("imageUrl", "");
              }}
            />
            <label className="field">
              Product name
              <input
                autoFocus
                required
                maxLength={100}
                placeholder="e.g. Mango Juice"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <div className="field">
              <label htmlFor="product-category">Category</label>
              <Select
                id="product-category"
                required
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="" disabled>
                  Select category
                </option>
                {options.map((category) => (
                  <option
                    key={category._id}
                    value={category._id}
                    disabled={!category.active}
                  >
                    {category.name}
                    {!category.active ? " (inactive)" : ""}
                  </option>
                ))}
              </Select>
              {categoryError && <p role="alert">{categoryError}</p>}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setCategoryName("");
                  setCategoryErrorMessage("");
                  setCategoryOpen(true);
                }}
              >
                <Plus size={15} />
                Add New Category
              </button>
            </div>
            <div className="field-grid">
              <label className="field">
                Base price (INR)
                <input
                  type="number"
                  required
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={form.basePrice}
                  onChange={(e) => set("basePrice", e.target.value)}
                />
              </label>
              <label className="field">
                Status
                <Select
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => set("active", e.target.value === "active")}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </label>
            </div>
            <label className="option-toggle">
              <span><strong>Special</strong><small>Show in the Special category in New Sale.</small></span>
              <input type="checkbox" role="switch" aria-label="Special product" checked={form.special === true} onChange={e => set("special", e.target.checked)} />
            </label>
            {["variants", "addons"].map((key) => (
              <OptionEditor
                key={key}
                title={key === "variants" ? "Variants" : "Add-ons"}
                enabled={form[`${key}Enabled`]}
                items={form[key]}
                onToggle={(value) => set(`${key}Enabled`, value)}
                onChange={(value) => set(key, value)}
              />
            ))}
            <label className="option-toggle product-availability-field">
              <span>
                <strong>Availability</strong>
                <small>
                  {form.available !== false
                    ? "Available to sell"
                    : "Sold out — unavailable in New Sale"}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Product availability"
                checked={form.available !== false}
                onChange={(e) => set("available", e.target.checked)}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
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
                ? "Saving…"
                : initial._id
                  ? "Save changes"
                  : "Add Product"}
            </button>
          </footer>
        </form>
      </Modal>
      {categoryOpen && (
        <Modal
          compact
          title="Create Category"
          onClose={creating ? () => {} : () => setCategoryOpen(false)}
        >
          <form onSubmit={createCategory}>
            <fieldset disabled={creating} className="modal-body">
              <label className="field">
                Category name
                <input
                  autoFocus
                  required
                  maxLength={60}
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                />
              </label>
              {categoryErrorMessage && (
                <p className="form-error" role="alert">
                  {categoryErrorMessage}
                </p>
              )}
            </fieldset>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={creating}
                onClick={() => setCategoryOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={creating}>
                {creating ? "Creating…" : "Create Category"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
function OptionEditor({ title, enabled, items, onToggle, onChange }) {
  const singular = title === "Variants" ? "variant" : "add-on";
  return (
    <section className="option-section">
      <label className="option-toggle">
        <span>
          <strong>{title}</strong>
          <small>
            {title === "Variants"
              ? "Offer different sizes or options."
              : "Offer optional extras with their own prices."}
          </small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={`Enable ${title.toLowerCase()}`}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      {enabled && (
        <div className="option-list">
          {items.map((item, index) => (
            <div className="option-row" key={item._id || item.id}>
              <input
                aria-label={`${singular} ${index + 1} name`}
                required
                maxLength={60}
                placeholder={
                  title === "Variants" ? "e.g. Small" : "e.g. Extra ice cream"
                }
                value={item.name}
                onChange={(e) =>
                  onChange(
                    items.map((entry, i) =>
                      i === index ? { ...entry, name: e.target.value } : entry,
                    ),
                  )
                }
              />
              <input
                aria-label={`${singular} ${index + 1} price in rupees`}
                type="number"
                required
                min="0"
                max="1000000"
                step="0.01"
                placeholder="Price (INR)"
                value={item.price}
                onChange={(e) =>
                  onChange(
                    items.map((entry, i) =>
                      i === index ? { ...entry, price: e.target.value } : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${singular} ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange([
                ...items,
                { id: crypto.randomUUID(), name: "", price: "" },
              ])
            }
          >
            <Plus size={15} /> Add {singular}
          </button>
        </div>
      )}
    </section>
  );
}
