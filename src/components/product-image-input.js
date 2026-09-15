"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/product-images";

export default function ProductImageInput({
  imageUrl,
  file,
  onChange,
  disabled,
}) {
  const input = useRef(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const source = file ? preview : imageUrl;
  function select(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (
      !PRODUCT_IMAGE_TYPES.includes(selected.type) ||
      !selected.size ||
      selected.size > MAX_PRODUCT_IMAGE_BYTES
    ) {
      setError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(selected));
    onChange(selected);
  }
  return (
    <div className="product-image-field">
      <span className="field">
        Product image <small className="muted">Optional</small>
      </span>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose product image"
        disabled={disabled}
        onChange={select}
        tabIndex={-1}
      />
      <button
        className={`product-image-square ${source ? "has-image" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={source ? "Replace product image" : "Add product image"}
        onClick={() => input.current?.click()}
      >
        {source ? (
          <img src={source} alt="Product image preview" />
        ) : (
          <Plus size={34} strokeWidth={1.5} />
        )}
        {source && <span className="image-replace-hint">Change image</span>}
      </button>
      <small className="muted">JPEG, PNG or WebP · Up to 5 MB</small>
      {source && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            setPreview("");
            setError("");
            onChange(null);
          }}
        >
          Remove image
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
